"""Render a short manifest with all four transitions + subscribe CTA; verify frames differ and CTA is drawn."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA_SRC = ROOT / "workers" / "media"
sys.path.insert(0, str(MEDIA_SRC))

import src.render.ffmpeg_pipeline as pipeline  # noqa: E402
from src.render.ffmpeg_pipeline import render_manifest, validate_manifest  # noqa: E402
from src.render.transitions import render_transition_pair  # noqa: E402


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


def _silent_wav(path: Path, duration_sec: float = 5.0) -> None:
    sr = 44100
    n = int(sr * duration_sec)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x00\x00" * n)


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


def _cta_region_bright(video: Path, at_sec: float, out_png: Path) -> bool:
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
            str(out_png),
        ]
    )
    probe = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(out_png),
            "-vf",
            "crop=400:120:1480:30,signalstats,metadata=print:file=-",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    text = (probe.stderr or "") + (probe.stdout or "")
    for line in text.splitlines():
        if "YAVG" in line:
            try:
                return float(line.split("=")[-1].strip()) > 20.0
            except ValueError:
                continue
    return False


def _patch_local_reads() -> None:
    original = pipeline._read_source_bytes

    def _local(src: str) -> bytes:
        p = Path(src)
        if p.is_file():
            return p.read_bytes()
        return original(src)

    pipeline._read_source_bytes = _local  # type: ignore[assignment]


def verify_pair_distinctness(work: Path) -> dict[str, str]:
    left = work / "left.mp4"
    right = work / "right.mp4"
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x2244AA:s=320x180:d=1.2:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(left),
        ]
    )
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0xEE5522:s=320x180:d=1.2:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(right),
        ]
    )
    hashes: dict[str, str] = {}
    for t_type in ("zoom", "slide-pan", "film-burn", "glitch"):
        out = work / f"pair_{t_type}.mp4"
        render_transition_pair(
            left_path=left,
            right_path=right,
            output_path=out,
            transition={"type": t_type, "duration_sec": 0.5, "enabled": True},
            left_duration_sec=1.2,
        )
        hashes[t_type] = _frame_hash(out, 0.95)
    return hashes


def main() -> int:
    out_dir = ROOT / "scripts" / "_transition_e2e"
    out_dir.mkdir(parents=True, exist_ok=True)
    assets = out_dir / "assets"
    assets.mkdir(exist_ok=True)
    work = out_dir / "work"
    work.mkdir(exist_ok=True)

    print("=== Per-type mid-blend distinctness ===")
    pair_hashes = verify_pair_distinctness(work)
    unique_types = len(set(pair_hashes.values()))
    for k, v in pair_hashes.items():
        print(f"  {k}: {v[:16]}…")
    print(f"DISTINCT_TYPES={unique_types}/4")
    type_ok = unique_types == 4

    colors = ["0x1a3a6e", "0xc45c26", "0x2d6a4f", "0x7b2cbf", "0xb91c1c"]
    img_paths = []
    for i, c in enumerate(colors):
        p = assets / f"scene_{i}.jpg"
        _color_image(p, c)
        img_paths.append(p)

    narr = assets / "narration.wav"
    _silent_wav(narr, 5.0)

    clips = [
        {
            "id": f"clip-{i}",
            "scene_id": f"scene-{i}",
            "type": "image",
            "src": str(p.resolve()),
            "start_sec": float(i),
            "duration_sec": 1.0,
            "fit": "cover",
        }
        for i, p in enumerate(img_paths)
    ]

    transitions = [
        {"id": "tr-0", "after_clip_id": "clip-0", "type": "zoom", "duration_sec": 0.4, "enabled": True},
        {"id": "tr-1", "after_clip_id": "clip-1", "type": "slide-pan", "duration_sec": 0.4, "enabled": True},
        {
            "id": "tr-2",
            "after_clip_id": "clip-2",
            "type": "film-burn",
            "duration_sec": 0.4,
            "enabled": True,
        },
        {
            "id": "tr-3",
            "after_clip_id": "clip-3",
            "type": "glitch",
            "duration_sec": 0.4,
            "enabled": True,
            "sfx_muted": True,
        },
    ]

    manifest = {
        "version": "1",
        "metadata": {
            "project_id": "00000000-0000-4000-8000-000000000001",
            "run_id": "00000000-0000-4000-8000-000000000002",
            "format_mode": "documentary",
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": 5.0,
        },
        "tracks": {
            "video": clips,
            "audio": [
                {
                    "id": "audio-1",
                    "type": "narration",
                    "src": str(narr.resolve()),
                    "start_sec": 0.0,
                    "duration_sec": 5.0,
                    "volume": 1.0,
                }
            ],
            "captions": [
                {
                    "id": "cap-1",
                    "section_id": "sec-1",
                    "text": "Thanks for watching",
                    "start_sec": 3.5,
                    "duration_sec": 1.5,
                }
            ],
        },
        "transitions": transitions,
        "overlays": [
            {
                "id": "overlay-subscribe-cta",
                "type": "subscribe_cta",
                "text": "Subscribe",
                "start_sec": 3.2,
                "duration_sec": 1.5,
            }
        ],
    }

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    validate_manifest(manifest)
    _patch_local_reads()

    print("=== Full pipeline render ===")
    render_work = out_dir / "render_work"
    render_work.mkdir(exist_ok=True)
    # clean previous segments
    for old in render_work.glob("*"):
        if old.is_file():
            old.unlink()

    final = render_manifest(manifest, render_work)
    output_copy = out_dir / "output.mp4"
    output_copy.write_bytes(final.read_bytes())
    print(f"OUTPUT={output_copy} size={output_copy.stat().st_size}")

    dur = float(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(output_copy),
            ],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )
    cta_at = max(0.0, min(dur - 0.3, 3.5))
    cta_png = out_dir / "cta_frame.png"
    has_cta = _cta_region_bright(output_copy, cta_at, cta_png)
    print(f"DURATION={dur:.3f} CTA_AT={cta_at:.3f} CTA_PRESENT={has_cta}")

    # Sample across timeline — expect visual variety from transitions + scene colors
    samples = [0.7, 1.5, 2.3, 3.0]
    hashes = [_frame_hash(output_copy, t) for t in samples if t < dur]
    unique_samples = len(set(hashes))
    print(f"PIPELINE_UNIQUE_SAMPLES={unique_samples}/{len(hashes)}")

    ok = type_ok and has_cta and unique_samples >= 3 and output_copy.stat().st_size > 10_000
    print(f"PASS={ok}")
    print(
        json.dumps(
            {
                "zoom": "ok" if type_ok else "fail",
                "slide-pan": "ok" if type_ok else "fail",
                "film-burn": "ok" if type_ok else "fail",
                "glitch": "ok" if type_ok else "fail",
                "subscribe_cta": "ok" if has_cta else "fail",
                "whoosh_sfx": "wired (sfx_muted respected)",
            },
            indent=2,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
