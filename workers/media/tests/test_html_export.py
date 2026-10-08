"""Trusted HTML clips are isolated, cached, and never silently replaced by SVG."""
import copy
import json
from pathlib import Path

import pytest

from src.config import settings
from src.render.html_pipeline import prepare_html_clips


def manifest():
    return {"metadata": {"duration_sec": 20, "fps": 30, "resolution": {"width": 320, "height": 180}},
            "tracks": {"video": [{"id": "press", "type": "image", "src": "color:#000000", "start_sec": 8,
            "duration_sec": 2, "source_start_sec": 3, "motion_template": {"id": "editorial-title", "title": "A new chapter",
            "html_template": {"id": "press-cutout-v1", "durationSec": 10, "assets": [],
                              "audioCues": [{"at": 3.4, "sound": "press-marker", "gain": .3}]}}}], "broll": []}}


def test_ordinary_and_untrusted_html_never_launch_browser(tmp_path):
    class NeverRun:
        def run(self, args):
            raise AssertionError("Only trusted built-in scenes may execute browser code")
    value = manifest()
    value["tracks"]["video"][0]["motion_template"]["html_template"]["id"] = "user-upload"
    assert prepare_html_clips(value, tmp_path, NeverRun(), "libx264", lambda *_: None) is value


def test_builtin_bake_preserves_source_clock_and_original_audio_plan(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "render_cache_dir", "")
    monkeypatch.setattr("src.render.html_pipeline.valid_video", lambda *_: True)
    class Capture:
        def run(self, args):
            self.batch = json.loads(Path(args[-1]).read_text())
    runner = Capture()
    original = manifest()
    snapshot = copy.deepcopy(original)
    result = prepare_html_clips(original, tmp_path, runner, "libx264", lambda *_: None)
    job = runner.batch["jobs"][0]
    assert job["offset"] == 3 and job["frames"] == 60
    assert job["scene"]["title"] == "A new chapter"
    assert original == snapshot
    baked = result["tracks"]["video"][0]
    assert baked["start_sec"] == 8 and baked["duration_sec"] == 2
    assert baked["source_start_sec"] == 0 and baked["muted"] is True
    assert "motion_template" not in baked
    assert original["tracks"]["video"][0]["motion_template"]["html_template"]["audioCues"]
    moved = copy.deepcopy(original)
    moved["tracks"]["video"][0]["start_sec"] = 1700
    prepare_html_clips(moved, tmp_path / "moved", runner, "libx264", lambda *_: None)
    assert runner.batch["jobs"][0]["fingerprint"] == job["fingerprint"]


def test_failed_builtin_export_never_falls_back(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "render_cache_dir", "")
    class Failure:
        def run(self, args):
            raise RuntimeError("Capture failed")
    with pytest.raises(RuntimeError, match="Capture failed"):
        prepare_html_clips(manifest(), tmp_path, Failure(), "libx264", lambda *_: None)
    assert not (tmp_path / "html-motion/cache.json").exists()

@pytest.mark.parametrize("cutout", [False, True])
def test_legacy_source_type_and_explicit_subject(tmp_path, monkeypatch, cutout):
    monkeypatch.setattr(settings, "render_cache_dir", "")
    monkeypatch.setattr("src.render.html_pipeline.valid_video", lambda *_: True)
    video = tmp_path / "source.mp4"
    video.write_bytes(b"video")
    png = tmp_path / "subject.png"
    png.write_bytes(b"transparent")
    monkeypatch.setattr("src.render.native_pipeline.stage_assets", lambda m, d: {c["src"]: Path(c["src"]) for c in m["tracks"]["video"]})
    class Capture:
        posters = 0
        def ffmpeg(self, args):
            self.posters += 1
            Path(args[-1]).write_bytes(b"poster")
        def run(self, args):
            self.batch = json.loads(Path(args[-1]).read_text())
    value = manifest()
    clip = value["tracks"]["video"][0]
    clip["src"] = str(video)
    if cutout:
        clip["motion_template"]["html_template"]["assets"] = [{"key": "subject", "kind": "image", "url": str(png)}]
    runner = Capture()
    prepare_html_clips(value, tmp_path / "render", runner, "libx264", lambda *_: None)
    assert runner.posters == (0 if cutout else 1)
    import base64
    subject = runner.batch["jobs"][0]["scene"]["imageUrl"]
    assert base64.b64decode(subject.split(",")[1]) == (b"transparent" if cutout else b"poster")
