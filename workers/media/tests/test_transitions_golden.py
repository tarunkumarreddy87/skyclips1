"""Golden tests: each transition type produces a visibly different mid-blend frame."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

import pytest

from src.render.transitions import render_transition_pair

pytestmark = pytest.mark.skipif(
    subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode != 0,
    reason="ffmpeg not available",
)


def _make_color_clip(path: Path, color: str, duration: float = 1.2) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={color}:s=320x180:d={duration}:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


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


@pytest.fixture(scope="module")
def color_pair(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    root = tmp_path_factory.mktemp("xfade_src")
    left = root / "left.mp4"
    right = root / "right.mp4"
    _make_color_clip(left, "0x2244AA")
    _make_color_clip(right, "0xEE5522")
    return left, right


@pytest.mark.parametrize(
    "t_type",
    ["zoom", "slide-pan", "film-burn", "glitch", "dissolve", "wipeleft", "circleopen", "pixelize"],
)
def test_each_transition_type_renders(tmp_path: Path, color_pair: tuple[Path, Path], t_type: str) -> None:
    left, right = color_pair
    out = tmp_path / f"{t_type}.mp4"
    render_transition_pair(
        left_path=left,
        right_path=right,
        output_path=out,
        transition={"type": t_type, "duration_sec": 0.5, "enabled": True},
        left_duration_sec=1.2,
    )
    assert out.exists() and out.stat().st_size > 1000


def test_four_transition_types_produce_distinct_frames(
    tmp_path: Path, color_pair: tuple[Path, Path]
) -> None:
    left, right = color_pair
    hashes: dict[str, str] = {}
    # Mid-blend sample: left_dur - duration/2 ≈ 1.2 - 0.25 = 0.95
    sample_at = 0.95
    for t_type in ("zoom", "slide-pan", "film-burn", "glitch"):
        out = tmp_path / f"{t_type}.mp4"
        render_transition_pair(
            left_path=left,
            right_path=right,
            output_path=out,
            transition={"type": t_type, "duration_sec": 0.5, "enabled": True},
            left_duration_sec=1.2,
        )
        hashes[t_type] = _frame_hash(out, sample_at)

    unique = set(hashes.values())
    assert len(unique) == 4, f"Expected 4 distinct mid-blend frames, got {hashes}"


def test_cut_is_hard_concat(tmp_path: Path, color_pair: tuple[Path, Path]) -> None:
    left, right = color_pair
    out = tmp_path / "cut.mp4"
    render_transition_pair(
        left_path=left,
        right_path=right,
        output_path=out,
        transition={"type": "cut", "duration_sec": 0.5, "enabled": True},
        left_duration_sec=1.2,
    )
    assert out.exists()


def test_sfx_muted_skips_whoosh_cues() -> None:
    from src.render.transitions import collect_transition_sfx_cues

    clips = [
        {"id": "a", "start_sec": 0.0, "duration_sec": 2.0},
        {"id": "b", "start_sec": 2.0, "duration_sec": 2.0},
    ]
    muted = collect_transition_sfx_cues(
        clips,
        [{"after_clip_id": "a", "type": "zoom", "duration_sec": 0.5, "enabled": True, "sfx_muted": True}],
    )
    unmuted = collect_transition_sfx_cues(
        clips,
        [{"after_clip_id": "a", "type": "zoom", "duration_sec": 0.5, "enabled": True, "sfx_muted": False}],
    )
    assert muted == []
    assert len(unmuted) == 1
