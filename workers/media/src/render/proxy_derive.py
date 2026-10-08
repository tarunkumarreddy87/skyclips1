"""Shared FFmpeg helpers for preview proxy derivation (media worker path).

API currently owns the MVP HTTP endpoint; this module keeps key naming and
command shape aligned for a future Temporal activity.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def proxy_key_for(source_key: str) -> str:
    return f"{source_key}.proxy.mp4"


def poster_key_for(source_key: str) -> str:
    return f"{source_key}.poster.jpg"


def sprite_key_for(source_key: str) -> str:
    return f"{source_key}.sprite.jpg"


def write_proxy_mp4(src: Path, dest: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-vf",
            "scale=-2:540",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-an",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )


def write_poster_jpg(src: Path, dest: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            "1",
            "-i",
            str(src),
            "-frames:v",
            "1",
            "-q:v",
            "4",
            str(dest),
        ],
        allow_fail=True,
    )
    if not dest.is_file() or dest.stat().st_size == 0:
        _run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(src),
                "-frames:v",
                "1",
                "-q:v",
                "4",
                str(dest),
            ]
        )


def write_sprite_jpg(src: Path, dest: Path) -> bool:
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-vf",
            "fps=1/3,scale=160:-1,tile=10x1",
            "-frames:v",
            "1",
            "-q:v",
            "5",
            str(dest),
        ],
        allow_fail=True,
    )
    return dest.is_file() and dest.stat().st_size > 0


def _run(cmd: list[str], *, allow_fail: bool = False) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0 and not allow_fail:
        msg = (result.stderr or result.stdout or "ffmpeg failed")[-800:]
        raise RuntimeError(f"ffmpeg failed: {msg}")
