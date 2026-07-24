"""Phase 6 proof: manifest with mixed transform/animation/transitions → real MP4.

Requires ffmpeg. Does not touch S3 — assets are local files under tmp_path.
Proof artifact is also copied to workers/media/proofs/motion-phase6.mp4.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from src.render.ffmpeg_pipeline import render_manifest, validate_manifest
from src.render.motion_filters import build_segment_vf

pytestmark = pytest.mark.skipif(
    subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode != 0,
    reason="ffmpeg not available",
)

PROOF_DIR = Path(__file__).resolve().parents[1] / "proofs"
PROOF_MP4 = PROOF_DIR / "motion-phase6.mp4"


def _make_still(path: Path, color: str, size: str = "1280x720") -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={color}:s={size}:d=1",
            "-frames:v",
            "1",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def _make_silence(path: Path, duration_sec: float) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r=44100:cl=stereo",
            "-t",
            f"{duration_sec:.3f}",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def _frame_hash(video: Path, at_sec: float) -> str:
    raw = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{at_sec:.3f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        check=True,
        capture_output=True,
    ).stdout
    return hashlib.sha256(raw).hexdigest()


def _mean_luma(video: Path, at_sec: float) -> float:
    """Average luma of a single frame (0–255)."""
    raw = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{at_sec:.3f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "pipe:1",
        ],
        check=True,
        capture_output=True,
    ).stdout
    if not raw:
        return 0.0
    return sum(raw) / len(raw)


def _build_manifest(asset_dir: Path) -> dict:
    scene1 = asset_dir / "scene-1.jpg"
    scene2 = asset_dir / "scene-2.jpg"
    scene3 = asset_dir / "scene-3.jpg"
    broll = asset_dir / "broll-1.jpg"
    narr = asset_dir / "narration.wav"
    _make_still(scene1, "0x1A4D8C")  # blue
    _make_still(scene2, "0xC45C26")  # orange
    _make_still(scene3, "0x2E7D4F")  # green
    _make_still(broll, "0xF2D04B")  # yellow inset
    _make_silence(narr, 12.0)

    return {
        "version": "1",
        "metadata": {
            "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "run_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
            "format_mode": "documentary",
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": 12.0,
        },
        "tracks": {
            "video": [
                {
                    "id": "clip-1",
                    "scene_id": "scene-1",
                    "type": "image",
                    "src": str(scene1),
                    "start_sec": 0.0,
                    "duration_sec": 4.0,
                    "fit": "cover",
                    "transform": {
                        "x": 50,
                        "y": 50,
                        "scaleX": 1,
                        "scaleY": 1,
                        "rotation": 0,
                        "zIndex": 0,
                    },
                    "animation": {
                        "in": {"preset": "fade", "duration_sec": 0.8},
                        "out": {"preset": "zoom_out", "duration_sec": 0.5},
                    },
                },
                {
                    "id": "clip-2",
                    "scene_id": "scene-2",
                    "type": "image",
                    "src": str(scene2),
                    "start_sec": 4.0,
                    "duration_sec": 4.0,
                    "fit": "cover",
                    "animation": {
                        "in": {"preset": "ken_burns_in", "duration_sec": 0.6},
                        "loop": {"preset": "ken_burns"},
                    },
                },
                {
                    "id": "clip-3",
                    "scene_id": "scene-3",
                    "type": "image",
                    "src": str(scene3),
                    "start_sec": 8.0,
                    "duration_sec": 4.0,
                    "fit": "cover",
                    "transform": {
                        "x": 50,
                        "y": 50,
                        "scaleX": 0.85,
                        "scaleY": 0.85,
                        "rotation": 3,
                        "zIndex": 0,
                    },
                    "animation": {"in": {"preset": "slide", "duration_sec": 0.5}},
                },
            ],
            "audio": [
                {
                    "id": "audio-narration",
                    "type": "narration",
                    "src": str(narr),
                    "start_sec": 0.0,
                    "duration_sec": 12.0,
                    "volume": 1.0,
                }
            ],
            "captions": [
                {
                    "id": "cap-1",
                    "section_id": "sec-1",
                    "text": "Motion proof",
                    "start_sec": 0.5,
                    "duration_sec": 2.0,
                }
            ],
            "broll": [
                {
                    "id": "broll-1",
                    "scene_id": "scene-2",
                    "type": "image",
                    "src": str(broll),
                    "start_sec": 5.0,
                    "duration_sec": 2.0,
                    "fit": "cover",
                    "label": "Inset",
                    "transform": {
                        "x": 78,
                        "y": 22,
                        "scaleX": 0.35,
                        "scaleY": 0.35,
                        "rotation": -4,
                        "zIndex": 2,
                    },
                    "animation": {
                        "in": {"preset": "pop", "duration_sec": 0.4},
                        "out": {"preset": "fade", "duration_sec": 0.35},
                    },
                }
            ],
        },
        "transitions": [
            {
                "id": "tr-1",
                "after_clip_id": "clip-1",
                "type": "dissolve",
                "duration_sec": 0.5,
                "enabled": True,
            },
            {
                "id": "tr-2",
                "after_clip_id": "clip-2",
                "type": "wipeleft",
                "duration_sec": 0.45,
                "enabled": True,
            },
        ],
        "overlays": [],
        "settings": {"captions_enabled": True, "theme_id": "standard"},
    }


def test_motion_filters_string_includes_expected_ops() -> None:
    """Sanity: Phase 5 mapping still produces the ops this proof relies on."""
    vf = build_segment_vf(
        fit="cover",
        duration_sec=4.0,
        animation={
            "in": {"preset": "fade", "duration_sec": 0.8},
            "out": {"preset": "zoom_out", "duration_sec": 0.5},
        },
    )
    assert "fade=t=in" in vf
    assert "zoompan=" in vf


def test_phase6_motion_render_proof(tmp_path: Path) -> None:
    asset_dir = tmp_path / "assets"
    asset_dir.mkdir()
    work = tmp_path / "work"
    work.mkdir()

    manifest = _build_manifest(asset_dir)
    validate_manifest(manifest)

    # Persist manifest next to proof for debugging.
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    (PROOF_DIR / "motion-phase6.manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    out = render_manifest(manifest, work)
    assert out.exists() and out.stat().st_size > 50_000

    shutil.copyfile(out, PROOF_MP4)
    assert PROOF_MP4.exists()

    # Video may be tpad'd to narration length (~12s) after xfade shortening.
    dur = _probe_duration(PROOF_MP4)
    assert 10.0 <= dur <= 12.5, f"unexpected duration {dur:.3f}s"

    # Fade-in: first frame darker than mid-clip-1
    luma_t0 = _mean_luma(PROOF_MP4, 0.05)
    luma_mid1 = _mean_luma(PROOF_MP4, 2.0)
    assert luma_t0 < luma_mid1 - 5, (
        f"fade-in not visible: t0 luma={luma_t0:.1f} mid={luma_mid1:.1f}"
    )

    # Distinct scenes / transition window: mid dissolve ≠ solid mid clips
    h_clip1 = _frame_hash(PROOF_MP4, 2.0)
    h_dissolve = _frame_hash(PROOF_MP4, 3.75)  # near first xfade
    h_clip2 = _frame_hash(PROOF_MP4, 4.3)
    assert len({h_clip1, h_dissolve, h_clip2}) == 3, "expected distinct frames across dissolve"

    # B-roll inset (top-right): brighter yellow ROI while enabled vs before
    def _roi_mean(at_sec: float) -> float:
        raw = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{at_sec:.3f}",
                "-i",
                str(PROOF_MP4),
                "-frames:v",
                "1",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "pipe:1",
            ],
            check=True,
            capture_output=True,
        ).stdout
        w, h = 1920, 1080
        assert len(raw) == w * h * 3
        cx, cy = int(0.78 * w), int(0.22 * h)
        total = 0
        n = 0
        for y in range(cy - 40, cy + 40):
            for x in range(cx - 40, cx + 40):
                i = (y * w + x) * 3
                total += raw[i] + raw[i + 1] + raw[i + 2]
                n += 3
        return total / n

    roi_before = _roi_mean(4.2)
    roi_during = _roi_mean(5.8)
    assert roi_during > roi_before + 20, (
        f"broll inset not visible: before={roi_before:.1f} during={roi_during:.1f}"
    )
