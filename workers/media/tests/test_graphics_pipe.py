"""Regressions for FFmpeg ending an RGBA stream before the SVG producer.

These use the real Node CLI and FFmpeg, without storage, GPU, or cloud services.
An expected EPIPE is harmless only when the encoder succeeds and its output has
the required number of frames.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from src.config import settings
from src.render.native_pipeline import Runner, graphics_command, probe, render_section

pytestmark = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("node"),
    reason="FFmpeg and the installed shared Node graphics runtime are required",
)


def _manifest(duration: float = 2) -> dict:
    return {
        "version": "1",
        "metadata": {"project_id": "pipe-proof", "run_id": "pipe-proof", "format_mode": "documentary",
                     "resolution": {"width": 320, "height": 180}, "fps": 30, "duration_sec": duration},
        "tracks": {"video": [], "audio": [], "captions": []},
        "graphics": [{"id": "shape", "type": "shape", "shape": "circle", "color": "#ffd166",
                      "start_sec": 0, "duration_sec": duration, "width_pct": 20, "height_pct": 25}],
        "settings": {"captions_enabled": False, "sfx_volume": 0},
    }


def _graphics_args(tmp_path: Path, manifest: dict) -> list[str]:
    try:
        command = graphics_command()
    except RuntimeError as exc:
        pytest.skip(str(exc))
    request = tmp_path / "graphics.json"
    request.write_text(json.dumps({"manifest": manifest, "startFrame": 0,
        "frameCount": round(manifest["metadata"]["duration_sec"] * 30), "width": 320,
        "height": 180, "fps": 30, "assetPaths": {}, "outputDir": str(tmp_path / "frames")}),
        encoding="utf-8")
    return [*command, str(request), "--raw"]


def test_graphics_cli_exits_cleanly_when_consumer_closes_after_one_frame(tmp_path: Path):
    """A consumer intentionally needing one frame must not cause a job failure."""
    producer = subprocess.Popen(_graphics_args(tmp_path, _manifest()),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert producer.stdout is not None
    try:
        first = producer.stdout.read(320 * 180 * 4)
        assert len(first) == 320 * 180 * 4
        # Fifty-nine requested frames remain. Closing now reliably exercises the
        # actual OS pipe and Node stream error, rather than mocking an EPIPE.
        producer.stdout.close()
        assert producer.wait(timeout=20) == 0
        assert producer.stderr is not None
        assert b"EPIPE" not in producer.stderr.read()
    finally:
        if producer.poll() is None:
            producer.kill()
            producer.wait()
        if producer.stderr is not None:
            producer.stderr.close()


def test_real_encoder_error_is_not_hidden_by_clean_graphics_epipe(tmp_path: Path):
    """Producer success after EPIPE must not conceal FFmpeg's failed encoder."""
    with pytest.raises(RuntimeError, match=r"(?i)unknown encoder|encoder.*not found"):
        Runner().graphics_pipe(_graphics_args(tmp_path, _manifest()), [
            "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "320x180",
            "-framerate", "30", "-i", "pipe:0", "-frames:v", "1",
            "-c:v", "deliberately_missing_encoder", str(tmp_path / "failed.mp4"),
        ])


def test_incomplete_successful_encode_is_rejected_before_cache(tmp_path: Path, monkeypatch):
    """An encoder may exit zero while yielding a playable but truncated MP4."""
    monkeypatch.setattr(settings, "render_encoder", "libx264")
    monkeypatch.setattr(settings, "render_cache_dir", str(tmp_path / "cache"))
    source = tmp_path / "source.png"
    runner = Runner()
    runner.ffmpeg(["-f", "lavfi", "-i", "color=blue:s=320x180", "-frames:v", "1", str(source)])
    manifest = _manifest(1)
    clip = {"id": "scene", "scene_id": "scene", "type": "image", "src": str(source),
            "start_sec": 0, "duration_sec": 1, "fit": "cover"}
    manifest["tracks"]["video"] = [clip]
    # Ensure installed graphics dependencies before injecting early encoder stop.
    _graphics_args(tmp_path, manifest)
    actual_pipe = runner.graphics_pipe

    def encode_only_first_frame(graphics: list[str], args: list[str]) -> None:
        reduced = list(args)
        reduced[reduced.index("-frames:v") + 1] = "1"
        actual_pipe(graphics, reduced)

    monkeypatch.setattr(runner, "graphics_pipe", encode_only_first_frame)
    with pytest.raises(RuntimeError, match=r"encoded 1 frames; expected 30"):
        render_section(clip, None, None, manifest, {str(source): source},
                       tmp_path / "section", runner, "libx264")
    video = next(stream for stream in probe(tmp_path / "section/section.mp4")["streams"]
                 if stream["codec_type"] == "video")
    assert int(video["nb_frames"]) == 1
    assert not list((tmp_path / "cache").glob("*.mp4"))
