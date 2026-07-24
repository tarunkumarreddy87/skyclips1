"""Render the same short timeline twice with different themes; prove visible distinctness."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA_SRC = ROOT / "workers" / "media"
sys.path.insert(0, str(MEDIA_SRC))

import src.render.ffmpeg_pipeline as pipeline  # noqa: E402
from src.render.ffmpeg_pipeline import render_manifest, validate_manifest  # noqa: E402
from src.render.themes import get_theme  # noqa: E402


def _run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"cmd failed: {' '.join(cmd)}\n{(r.stderr or '')[-1200:]}")


def _color_image(path: Path, color: str) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={color}:s=1920x1080:d=1",
            "-frames:v",
            "1",
            str(path),
        ]
    )


def _silent_wav(path: Path, duration_sec: float = 4.0) -> None:
    sr = 44100
    n = int(sr * duration_sec)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x00\x00" * n)


def _frame_at(video: Path, at_sec: float, out: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{at_sec:.3f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            str(out),
        ]
    )


def _rgb_mean(path: Path, crop: str) -> tuple[float, float, float]:
    """Return mean R,G,B for a crop region via ffmpeg signalstats (approx via raw)."""
    raw = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(path),
            "-vf",
            f"crop={crop},scale=1:1",
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
    if len(raw) < 3:
        return (0.0, 0.0, 0.0)
    return (float(raw[0]), float(raw[1]), float(raw[2]))


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _patch_local_reads() -> None:
    original = pipeline._read_source_bytes

    def _local(src: str) -> bytes:
        p = Path(src)
        if p.is_file():
            return p.read_bytes()
        return original(src)

    pipeline._read_source_bytes = _local  # type: ignore[assignment]


def _build_manifest(*, theme_id: str, assets: Path, narr: Path, imgs: list[Path]) -> dict:
    clips = []
    start = 0.0
    for i, img in enumerate(imgs):
        clips.append(
            {
                "id": f"clip-{i}",
                "scene_id": f"scene-{i}",
                "type": "image",
                "src": str(img),
                "start_sec": start,
                "duration_sec": 1.0,
                "fit": "cover",
            }
        )
        start += 1.0
    return {
        "version": "1",
        "metadata": {
            "project_id": "00000000-0000-4000-8000-0000000000a1",
            "run_id": f"00000000-0000-4000-8000-0000000000{theme_id[:2]}",
            "format_mode": "documentary",
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": 4.0,
        },
        "tracks": {
            "video": clips,
            "audio": [
                {
                    "id": "audio-1",
                    "type": "narration",
                    "src": str(narr),
                    "start_sec": 0.0,
                    "duration_sec": 4.0,
                    "volume": 1.0,
                }
            ],
            "captions": [
                {
                    "id": "cap-1",
                    "section_id": "sec-1",
                    "text": "A shared narration line for theme compare",
                    "start_sec": 0.5,
                    "duration_sec": 1.5,
                }
            ],
            "broll": [],
            "music": [],
        },
        "transitions": [],
        "overlays": [
            {
                "id": "chapter-1",
                "type": "chapter_title",
                "text": "Chapter One",
                "start_sec": 0.8,
                "duration_sec": 1.2,
            },
            {
                "id": "cta-1",
                "type": "subscribe_cta",
                "text": "Subscribe",
                "start_sec": 2.5,
                "duration_sec": 1.4,
            },
        ],
        "settings": {
            "captions_enabled": True,
            "music_volume": 0.0,
            "narration_volume": 1.0,
            "sfx_volume": 0.0,
            "theme_id": theme_id,
        },
    }


def main() -> int:
    out_dir = ROOT / "scripts" / "_theme_e2e"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    assets = out_dir / "assets"
    assets.mkdir()
    _patch_local_reads()

    colors = ["0x4b5563", "0x6b7280", "0x9ca3af", "0xd1d5db"]
    imgs = []
    for i, c in enumerate(colors):
        p = assets / f"scene_{i}.jpg"
        _color_image(p, c)
        imgs.append(p)
    narr = assets / "narration.wav"
    _silent_wav(narr, 4.0)

    themes = ("crime", "modern")
    results: dict[str, dict] = {}

    for theme_id in themes:
        work = out_dir / f"work_{theme_id}"
        work.mkdir()
        manifest = _build_manifest(theme_id=theme_id, assets=assets, narr=narr, imgs=imgs)
        (out_dir / f"manifest_{theme_id}.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        validate_manifest(manifest)
        mp4 = render_manifest(manifest, work)
        final = out_dir / f"final_{theme_id}.mp4"
        shutil.copyfile(mp4, final)

        # Mid-grade frame (no overlays heavy) and CTA region frame
        grade_frame = out_dir / f"grade_{theme_id}.jpg"
        cta_frame = out_dir / f"cta_{theme_id}.jpg"
        chapter_frame = out_dir / f"chapter_{theme_id}.jpg"
        _frame_at(final, 0.2, grade_frame)  # grade-only-ish early frame
        _frame_at(final, 1.2, chapter_frame)
        _frame_at(final, 3.0, cta_frame)

        # CTA box sits top-right ~1480,30 size ~400x120
        cta_rgb = _rgb_mean(cta_frame, "320:100:1550:40")
        # Center sample for grade difference
        grade_rgb = _rgb_mean(grade_frame, "200:200:860:440")
        theme = get_theme(theme_id)
        results[theme_id] = {
            "mp4": str(final),
            "sha256": _sha(final)[:16],
            "cta_rgb": cta_rgb,
            "grade_rgb": grade_rgb,
            "expected_primary": theme["palette"]["primary"],
            "grade_intensity": theme["visual_grade"]["intensity"],
        }
        print(f"=== {theme_id} ===")
        print(f"  OUTPUT={final} size={final.stat().st_size}")
        print(f"  CTA_RGB={cta_rgb} expected_primary={theme['palette']['primary']}")
        print(f"  GRADE_RGB={grade_rgb} intensity={theme['visual_grade']['intensity']}")

    crime = results["crime"]
    modern = results["modern"]
    files_differ = crime["sha256"] != modern["sha256"]
    # Crime CTA is deep red (high R, low G/B); Modern is blue (high B)
    crime_is_redder = crime["cta_rgb"][0] > crime["cta_rgb"][2] + 20
    modern_is_bluer = modern["cta_rgb"][2] > modern["cta_rgb"][0] + 15
    grade_diff = sum(abs(a - b) for a, b in zip(crime["grade_rgb"], modern["grade_rgb"]))
    grade_ok = grade_diff > 8.0

    print("=== Compare ===")
    print(f"FILES_DIFFER={files_differ}")
    print(f"CRIME_CTA_RED={crime_is_redder} MODERN_CTA_BLUE={modern_is_bluer}")
    print(f"GRADE_RGB_L1={grade_diff:.1f} GRADE_DISTINCT={grade_ok}")

    pass_ok = files_differ and crime_is_redder and modern_is_bluer and grade_ok
    print(f"PASS={pass_ok}")
    (out_dir / "report.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    return 0 if pass_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
