"""Real local export proofs, with no storage service or paid services."""
import json
import math
import shutil
import struct
import sys
import subprocess
import threading
from pathlib import Path

import pytest

from src.config import settings
from src.render.ffmpeg_pipeline import render_manifest
from src.render.native_pipeline import Runner, RenderCancelled, probe, select_encoder

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")


def make_asset(path: Path, color: str):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"color={color}:s=320x180:r=30:d=3", "-f", "lavfi", "-i",
                    "sine=frequency=700:sample_rate=48000:duration=3", "-c:v", "libx264",
                    "-vf", "drawbox=color=green:t=fill:enable='lt(t,0.5)'",
                    "-af", "volume=0:enable='lt(t,0.5)'",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path)], check=True)


def manifest(assets: list[Path]) -> dict:
    return {"version": "1", "metadata": {"project_id": "proof", "run_id": "proof", "format_mode": "documentary",
        "resolution": {"width": 320, "height": 180}, "fps": 30, "duration_sec": 4},
        "tracks": {"video": [{"id": f"v{i}", "scene_id": f"s{i}", "type": "video", "src": str(p),
            "start_sec": i*2, "source_start_sec": .5, "duration_sec": 2, "fit": "cover", "muted": True}
            for i,p in enumerate(assets)], "audio": [], "captions": [], "broll": [], "music": []},
        "settings": {"captions_enabled": True, "caption_style": "cinematic", "sfx_volume": 0},
        "transitions": [{"id": "tr", "after_clip_id": "v0", "type": "dissolve", "duration_sec": .5, "enabled": True}]}


def pixels(video: Path, at: float) -> bytes:
    return subprocess.run(["ffmpeg", "-v", "error", "-ss", str(at), "-i", str(video), "-frames:v", "1",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout


def audio_rms(video: Path, start: float, duration: float) -> float:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(video), "-t", str(duration),
        "-vn", "-f", "s16le", "-ac", "1", "-"], capture_output=True, check=True).stdout
    values = struct.unpack("<" + "h"*(len(raw)//2), raw)
    return math.sqrt(sum(v*v for v in values)/max(1, len(values)))


def test_absolute_timing_transitions_original_audio_and_graphics(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", str(tmp_path / "cache"))
    assets = [tmp_path/"red.mp4", tmp_path/"blue.mp4"]
    make_asset(assets[0], "red")
    make_asset(assets[1], "blue")
    m = manifest(assets)
    m["tracks"]["video"][1]["muted"] = False
    m["tracks"]["captions"] = [{"id": "cap", "section_id": "s", "text": "Premium captions",
        "start_sec": .1, "duration_sec": 1, "words": [{"text": "Premium", "start_sec": .1, "duration_sec": .4},
                                                    {"text": "captions", "start_sec": .5, "duration_sec": .6}]}]
    m["graphics"] = [{"id": "chart", "type": "bar_chart", "start_sec": 2.2, "duration_sec": 1.3,
        "data": [{"label": "A", "value": 25}, {"label": "B", "value": 80}], "color": "#ffd166",
        "width_pct": 35, "height_pct": 35, "transform": {"x": 50, "y": 50}}]
    out = render_manifest(m, tmp_path/"work")
    info = probe(out)
    assert abs(float(info["format"]["duration"]) - 4) <= 1/30
    stream = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert int(stream["nb_frames"]) == 120
    red, blend, blue = (pixels(out, t) for t in (1.3, 1.75, 2.05))
    assert red != blend != blue
    trimmed = pixels(out, .05)
    assert sum(trimmed[0::3]) > sum(trimmed[1::3]) * 2
    # The second clip begins at exactly t=2; transition never shifts its audio.
    assert audio_rms(out, .2, 1) < 1
    assert audio_rms(out, 2.05, .3) > 500
    assert pixels(out, .5) != red
    assert pixels(out, 2.8) != blue
    assert len(list((tmp_path/"cache").glob("*.mp4"))) == 2
    # An unchanged re-export reuses complete sections and produces the same decoded frames.
    cached = render_manifest(m, tmp_path/"cached")
    assert pixels(cached, 2.8) == pixels(out, 2.8)


def test_cancellation_kills_process_before_work(tmp_path: Path):
    event = threading.Event()
    event.set()
    with pytest.raises(RenderCancelled):
        Runner(event).run(["ffmpeg", "-version"])


@pytest.mark.parametrize("incoming_template", [False, True])
def test_transition_with_transformed_inputs_keeps_constant_frame_rate(tmp_path: Path, monkeypatch, incoming_template):
    """Rotated input links lose their frame-rate metadata in FFmpeg 7.x."""
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", "")
    m = manifest([])
    m["tracks"]["video"] = [
        {"id": f"v{i}", "scene_id": f"s{i}", "type": "image", "src": color,
         "start_sec": i * 2, "duration_sec": 2, "muted": True,
         "transform": {"scaleX": 1.1, "scaleY": 1.1, "rotation": 5, "x": 55, "y": 50}}
        for i, color in enumerate(["color:#ff0000", "color:#0000ff"])
    ]
    if incoming_template:
        m["tracks"]["video"][1]["motion_template"] = {"id": "editorial-title", "title": "Next scene"}
    m["tracks"]["captions"] = [{"id": "cap", "section_id": "s0", "text": "Transition proof",
        "start_sec": .1, "duration_sec": .6}]
    out = render_manifest(m, tmp_path / "work")
    info = probe(out)
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    assert video["r_frame_rate"] == "30/1"
    assert int(video["nb_frames"]) == 120
    assert abs(float(info["format"]["duration"]) - 4) <= 1 / 30
    assert pixels(out, 1.3) != pixels(out, 1.75) != pixels(out, 2.1)


def test_graphics_only_with_background_and_silent_audio(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", "")
    m = manifest([])
    m["metadata"]["duration_sec"] = 1
    m["settings"].update({"background_color": "#006600"})
    m["graphics"] = [{"id": "object", "type": "shape", "shape": "circle", "color": "#ffee00",
                      "start_sec": 0, "duration_sec": 1, "width_pct": 20, "height_pct": 30,
                      "transform": {"x": 50, "y": 50}}]
    m["transitions"] = []
    out = render_manifest(m, tmp_path / "work")
    frame = pixels(out, .6)
    assert frame[1] > frame[0] * 2
    center = (90*320+160)*3
    assert frame[center] > 180 and frame[center+1] > 180
    assert audio_rms(out, .2, .4) < 1
    assert abs(float(probe(out)["format"]["duration"]) - 1) < 1/30


@pytest.mark.parametrize("template", [None, {"id": "editorial-archive", "title": "Hold the source"}])
def test_short_footage_holds_through_full_timeline_slot(tmp_path: Path, monkeypatch, template):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", "")
    source = tmp_path / "short.mp4"
    make_asset(source, "red")
    m = single_manifest(str(source), duration=2)
    m["tracks"]["video"][0]["source_start_sec"] = 2.5
    if template:
        m["tracks"]["video"][0]["motion_template"] = template
    out = render_manifest(m, tmp_path / "work")
    video = next(s for s in probe(out)["streams"] if s["codec_type"] == "video")
    assert int(video["nb_frames"]) == 60, "A half-second source must fill its two-second slot"
    assert len(pixels(out, 1.9)) == 320 * 180 * 3


def test_unusable_hardware_falls_back(monkeypatch):
    select_encoder.cache_clear()
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 1, b"", b"no GPU"))
    assert select_encoder("auto") == "libx264"
    with pytest.raises(RuntimeError, match="unavailable"):
        select_encoder("h264_nvenc")
    select_encoder.cache_clear()



def single_manifest(source: str, *, kind: str = "video", duration: float = 2) -> dict:
    m = manifest([])
    m["metadata"]["duration_sec"] = duration
    m["tracks"]["video"] = [{"id": "scene", "scene_id": "scene", "type": kind, "src": source,
        "start_sec": 0, "source_start_sec": .5 if kind == "video" else 0,
        "duration_sec": duration, "fit": "cover", "muted": True}]
    m["transitions"] = []
    return m


def rgb_at(frame: bytes, x: int, y: int, width: int = 320) -> tuple[int, int, int]:
    offset = (y * width + x) * 3
    return tuple(frame[offset:offset+3])


def test_editorial_title_color_placeholder_and_source_footage_slot(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", "")
    title = single_manifest("color:#ff0000", kind="image")
    title["tracks"]["video"][0]["motion_template"] = {"id": "editorial-title", "title": "A clear title", "subtitle": "Synthetic render proof"}
    title_out = render_manifest(title, tmp_path / "title")
    before, settled = pixels(title_out, .1), pixels(title_out, 1.6)
    assert before != settled, "Title entrance must animate in exported frames"
    paper = rgb_at(settled, 315, 175)
    assert min(paper) > 200 and max(paper) - min(paper) < 12, "A color placeholder must not cover the paper template"
    assert int(next(stream for stream in probe(title_out)["streams"] if stream["codec_type"] == "video")["nb_frames"]) == 60

    source = tmp_path / "red.mp4"
    make_asset(source, "red")
    definition = single_manifest(str(source))
    definition["tracks"]["video"][0]["motion_template"] = {"id": "editorial-archive", "documentary_layout": "definition", "title": "A source footage slot", "subtitle": "The original footage remains visible"}
    definition_out = render_manifest(definition, tmp_path / "definition")
    entrance = rgb_at(pixels(definition_out, .1), 239, 93)
    subject = rgb_at(pixels(definition_out, 1.6), 239, 93)
    assert subject[0] > subject[1] * 2 and subject[0] > subject[2] * 2, "The settled template slot must contain source footage"
    assert entrance != subject, "The source slot must reveal rather than appearing at the beginning"
    outside = rgb_at(pixels(definition_out, 1.6), 315, 175)
    assert min(outside) > 200, "Footage must remain inside its template slot"


def test_noir_filter_desaturates_native_footage(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", "")
    source = tmp_path / "red.mp4"
    make_asset(source, "red")
    m = single_manifest(str(source), duration=1)
    m["tracks"]["video"][0]["visual_effects"] = {"filterId": "noir", "strength": 1}
    out = render_manifest(m, tmp_path / "noir")
    frame = pixels(out, .6)
    assert sum(abs(r-g) + abs(g-b) for r, g, b in zip(frame[0::3], frame[1::3], frame[2::3])) / (320 * 180) < 6
    assert 10 < sum(frame) / len(frame) < 180, "The monochrome result must retain visible footage"


def test_generated_scene_audio_follows_absolute_timing_and_sfx_bus(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", str(tmp_path / "cache"))
    m = single_manifest("color:#103050", kind="image", duration=2)
    m["settings"]["sfx_volume"] = 1
    m["overlays"] = [{"id": "custom", "type": "motion_scene", "start_sec": .5, "duration_sec": 1,
        "scene": {"version": 1, "title": "Timed cue", "durationMs": 1000, "background": "transparent", "layers": [{"id": "accent", "kind": "rectangle", "x": 50, "y": 50, "width": 10, "height": 10, "color": "#ffffff", "fontSize": 32, "fontWeight": 600, "fontFamily": "sans", "align": "center", "radius": 0, "strokeWidth": 0, "strokeColor": "#ffffff", "shadow": 0, "startMs": 0, "endMs": 1000, "easing": "linear", "keyframes": []}],
                  "audio": [{"sound": "tick", "startMs": 300, "volume": .5}]}}]
    out = render_manifest(m, tmp_path / "with-cue")
    assert audio_rms(out, .2, .2) < 1
    assert audio_rms(out, .84, .05) > 50, "Scene-relative cue timing must include overlay start"
    assert audio_rms(out, 1.4, .2) < 1
    m["settings"]["sfx_volume"] = 0
    muted = render_manifest(m, tmp_path / "muted-cue")
    assert audio_rms(muted, .8, .2) < 1, "The SFX bus must mute generated-scene cues"



def test_raw_graphics_cancellation_terminates_both_children(tmp_path: Path, monkeypatch):
    event = threading.Event()
    children = []
    original_popen = subprocess.Popen
    def remember(*args, **kwargs):
        process = original_popen(*args, **kwargs)
        children.append(process)
        return process
    monkeypatch.setattr(subprocess, "Popen", remember)
    producer = [sys.executable, "-u", "-c", "import sys,time\nwhile True:\n sys.stdout.buffer.write(bytes(16*16*4)); sys.stdout.buffer.flush(); time.sleep(.01)"]
    timer = threading.Timer(.35, event.set)
    timer.start()
    try:
        with pytest.raises(RenderCancelled):
            Runner(event).graphics_pipe(producer, ["-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "16x16", "-framerate", "30", "-i", "pipe:0", "-f", "null", "-"])
    finally:
        timer.cancel()
    assert len(children) == 2
    assert all(child.poll() is not None for child in children), "Stop must leave neither rasterizer nor compositor running"
