"""Real mixed 2D/3D exports, cache reuse and source-time edits (Chromium required)."""
import json
import shutil
import subprocess
import time
import threading
from pathlib import Path
import pytest
from src.config import settings
from src.render.native_pipeline import render_manifest_native, probe, Runner, RenderCancelled
from src.render.three_pipeline import prepare_three_clips

ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")


def scene():
    return {"version": 1, "background": "#080e1e", "camera": {"position": [0, 1, 6]}, "objects": [
        {"id": "box", "geometry": "box", "color": "#38bdf8", "position": [0, .6, 0], "spin": [.2, .8, 0]},
        {"id": "floor", "geometry": "box", "color": "#fbbf24", "position": [0, -1, 0], "scale": [3, .2, 1]},
    ]}


def image(path, seconds):
    return subprocess.run(["ffmpeg", "-v", "error", "-ss", str(seconds), "-i", str(path), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout


def test_plain_video_never_launches_three(tmp_path):
    class NeverRun:
        def run(self, args): raise AssertionError("Ordinary video must not launch Chromium")
    original = {"tracks": {"video": [{"src": "color:#000000"}]}}
    assert prepare_three_clips(original, tmp_path, NeverRun(), "libx264", lambda *_: None) is original


def test_three_cancellation_does_not_retry_or_leave_a_completed_export(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "render_cache_dir", "")
    event = threading.Event()
    timer = threading.Timer(1, event.set)
    manifest = {"metadata": {"fps": 30, "resolution": {"width": 320, "height": 180}},
                "tracks": {"video": [{"id": "long", "start_sec": 0, "duration_sec": 600, "src": "unused", "three_scene": scene()}]}}
    timer.start()
    started = time.perf_counter()
    try:
        with pytest.raises(RenderCancelled):
            prepare_three_clips(manifest, tmp_path, Runner(event), "libx264", lambda *_: None)
    finally:
        timer.cancel()
    assert time.perf_counter() - started < 12
    assert not (tmp_path / "three/cache.json").exists()
    assert not (tmp_path / "three/fallback.json").exists()


def test_mixed_export_cold_warm_and_trim(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", str(tmp_path / "cache"))
    m = {"version": "1", "metadata": {"duration_sec": 4, "resolution": {"width": 320, "height": 180}, "fps": 30},
         "tracks": {"video": [
             {"id": "red", "type": "image", "src": "color:#ff0000", "start_sec": 0, "duration_sec": 1},
             {"id": "three", "type": "video", "src": "unreachable-original.mp4", "start_sec": 1, "duration_sec": 2, "three_scene": scene()},
             {"id": "blue", "type": "image", "src": "color:#0000ff", "start_sec": 3, "duration_sec": 1}],
             "audio": [], "music": [], "broll": [{"id": "three-broll", "type": "video", "src": "unused.mp4", "start_sec": 3.1, "duration_sec": .6, "three_scene": scene(), "transform": {"x": 75, "y": 40, "scaleX": .4, "scaleY": .4}}], "captions": [{"id": "cap", "section_id": "s", "text": "3D documentary", "start_sec": 1.2, "duration_sec": 1.3}]},
         "transitions": [{"id": "tr", "after_clip_id": "red", "type": "dissolve", "duration_sec": .3, "enabled": True}],
         "settings": {"captions_enabled": True, "caption_style": "cinematic", "sfx_volume": 0}}
    sound = tmp_path / "tone.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=600:duration=4", str(sound)], check=True)
    m["tracks"]["audio"] = [{"id": "audio", "src": str(sound), "start_sec": 0, "duration_sec": 4, "volume": .5}]
    started = time.perf_counter()
    cold = render_manifest_native(m, tmp_path / "cold")
    cold_seconds = time.perf_counter() - started
    stream = next(s for s in probe(cold)["streams"] if s["codec_type"] == "video")
    assert int(stream["nb_frames"]) == 120
    assert any(s["codec_type"] == "audio" for s in probe(cold)["streams"])
    assert image(cold, .4) != image(cold, .85) != image(cold, 1.6) != image(cold, 3.6)
    request = json.loads((tmp_path / "cold/three/batch.json").read_text())
    baked = Path(next(job["output"] for job in request["jobs"] if job["frames"] == 60))
    assert image(baked, 0) != image(baked, 1)
    # Check readback orientation: the gold floor must remain below the blue box.
    frame = image(baked, 0)
    gold_y = [i // 320 for i in range(320 * 180) if frame[i*3] > 140 and frame[i*3+1] > 90 and frame[i*3+2] < 100]
    assert gold_y and sum(gold_y) / len(gold_y) > 90
    # No child process for Three clips on a warm export; FFmpeg still assembles audio.
    original_run = Runner.run
    def reject_three(self, args):
        assert not any("render-three.ts" in arg for arg in args)
        return original_run(self, args)
    with monkeypatch.context() as patch:
        patch.setattr(Runner, "run", reject_three)
        started = time.perf_counter()
        warm = render_manifest_native(m, tmp_path / "warm")
        warm_seconds = time.perf_counter() - started
        late = json.loads(json.dumps(m))
        late["metadata"]["duration_sec"] = 1800
        late["tracks"]["video"][1]["start_sec"] = 1798
        # Moving the same two-second scene to the end of a 30-minute documentary
        # must neither render 30 minutes of 3D nor invalidate its source cache.
        prepare_three_clips(late, tmp_path / "late", Runner(), "libx264", lambda *_: None)
    assert image(warm, 1.6) == image(cold, 1.6)
    assert json.loads((tmp_path / "warm/three/cache.json").read_text())[0]["cache_hit"]
    assert all(json.loads(p.read_text())["cache_hit"] for p in (tmp_path / "warm").glob("section-*/profile.json"))
    trimmed = json.loads(json.dumps(m))
    trimmed["tracks"]["video"][1]["source_start_sec"] = 1
    staged = prepare_three_clips(trimmed, tmp_path / "trim", Runner(), "libx264", lambda *_: None)
    trimmed_file = Path(staged["tracks"]["video"][1]["src"])
    # Separately encoded GOPs can differ slightly even for identical input pixels.
    a, b = image(trimmed_file, 0), image(baked, 1)
    assert len(a) == len(b)
    assert sum(abs(x-y) for x, y in zip(a, b)) / len(a) < 3
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(cold), "-f", "null", "-"], check=True)
    print(json.dumps({"cold_sec": cold_seconds, "warm_sec": warm_seconds, "frames": 120, "duration_sec": 4}))
