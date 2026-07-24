"""Fresh caption burn-in proof: overflow stays lower-third; captions_enabled=false suppresses ASS."""

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


LONG_CAPTION = (
    "This is an intentionally long caption line that would previously overflow the frame "
    "and cover most of the preview if wrapping and margins were broken — keep it readable."
)


def _run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"cmd failed: {' '.join(cmd)}\n{(r.stderr or '')[-1200:]}")


def _color_image(path: Path, color: str = "0x1f2937") -> None:
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


def _silent_wav(path: Path, duration_sec: float = 3.0) -> None:
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


def _region_mean_luma(frame: Path, crop: str) -> float:
    """Mean luma of an RGB crop (scale to 1x1)."""
    raw = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(frame),
            "-vf",
            f"crop={crop},scale=1:1,format=gray",
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
    return float(raw[0]) if raw else 0.0


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


def _manifest(*, captions_enabled: bool, assets: Path, narr: Path, img: Path) -> dict:
    return {
        "version": "1",
        "metadata": {
            "project_id": "00000000-0000-4000-8000-0000000000c1",
            "run_id": "00000000-0000-4000-8000-0000000000c2",
            "format_mode": "documentary",
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": 3.0,
        },
        "tracks": {
            "video": [
                {
                    "id": "clip-0",
                    "scene_id": "scene-0",
                    "type": "image",
                    "src": str(img),
                    "start_sec": 0.0,
                    "duration_sec": 3.0,
                    "fit": "cover",
                }
            ],
            "audio": [
                {
                    "id": "audio-1",
                    "type": "narration",
                    "src": str(narr),
                    "start_sec": 0.0,
                    "duration_sec": 3.0,
                    "volume": 1.0,
                }
            ],
            "captions": [
                {
                    "id": "cap-1",
                    "section_id": "sec-1",
                    "text": LONG_CAPTION,
                    "start_sec": 0.4,
                    "duration_sec": 2.2,
                }
            ],
            "broll": [],
            "music": [],
        },
        "transitions": [],
        "overlays": [],
        "settings": {
            "captions_enabled": captions_enabled,
            "music_volume": 0.0,
            "narration_volume": 1.0,
            "sfx_volume": 0.0,
            "theme_id": "standard",
        },
    }


def main() -> int:
    out_dir = ROOT / "scripts" / "_caption_e2e"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    assets = out_dir / "assets"
    assets.mkdir()
    _patch_local_reads()

    img = assets / "bg.jpg"
    narr = assets / "narration.wav"
    _color_image(img, "0x111827")
    _silent_wav(narr, 3.0)

    results: dict[str, object] = {}

    # --- Captions ON ---
    work_on = out_dir / "work_on"
    work_on.mkdir()
    man_on = _manifest(captions_enabled=True, assets=assets, narr=narr, img=img)
    (out_dir / "manifest_on.json").write_text(json.dumps(man_on, indent=2), encoding="utf-8")
    validate_manifest(man_on)
    mp4_on = render_manifest(man_on, work_on)
    final_on = out_dir / "final_captions_on.mp4"
    shutil.copyfile(mp4_on, final_on)
    frame_on = out_dir / "frame_captions_on.jpg"
    _frame_at(final_on, 1.2, frame_on)

    # Top band should stay dark (no overflowing caption block).
    top_luma = _region_mean_luma(frame_on, "1600:200:160:40")
    # Lower-third band should be brighter due to white caption glyphs.
    bottom_luma = _region_mean_luma(frame_on, "1200:160:360:860")
    overflow_ok = top_luma < 40.0 and bottom_luma > top_luma + 8.0

    # --- Captions OFF ---
    work_off = out_dir / "work_off"
    work_off.mkdir()
    man_off = _manifest(captions_enabled=False, assets=assets, narr=narr, img=img)
    (out_dir / "manifest_off.json").write_text(json.dumps(man_off, indent=2), encoding="utf-8")
    validate_manifest(man_off)
    mp4_off = render_manifest(man_off, work_off)
    final_off = out_dir / "final_captions_off.mp4"
    shutil.copyfile(mp4_off, final_off)
    frame_off = out_dir / "frame_captions_off.jpg"
    _frame_at(final_off, 1.2, frame_off)

    bottom_off = _region_mean_luma(frame_off, "1200:160:360:860")
    # Off should be near the dark plate; on should lighten the lower third.
    toggle_ok = bottom_luma > bottom_off + 8.0 and abs(bottom_off - top_luma) < 25.0
    files_differ = _sha(final_on) != _sha(final_off)

    # ASS file only written when enabled
    ass_on = work_on / "captions.ass"
    ass_off = work_off / "captions.ass"
    ass_ok = ass_on.is_file() and not ass_off.is_file()

    results = {
        "top_luma_on": top_luma,
        "bottom_luma_on": bottom_luma,
        "bottom_luma_off": bottom_off,
        "overflow_ok": overflow_ok,
        "toggle_ok": toggle_ok,
        "ass_ok": ass_ok,
        "files_differ": files_differ,
    }

    print("=== Captions ON ===")
    print(f"  OUTPUT={final_on} size={final_on.stat().st_size}")
    print(f"  TOP_LUMA={top_luma:.1f} BOTTOM_LUMA={bottom_luma:.1f} OVERFLOW_OK={overflow_ok}")
    print("=== Captions OFF ===")
    print(f"  OUTPUT={final_off} size={final_off.stat().st_size}")
    print(f"  BOTTOM_LUMA={bottom_off:.1f} TOGGLE_OK={toggle_ok} ASS_OK={ass_ok}")
    print(f"FILES_DIFFER={files_differ}")

    pass_ok = overflow_ok and toggle_ok and ass_ok and files_differ
    print(f"PASS={pass_ok}")
    (out_dir / "report.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    return 0 if pass_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
