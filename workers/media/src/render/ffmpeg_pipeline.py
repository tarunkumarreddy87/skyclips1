"""FFmpeg render pipeline from timeline manifest."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from src.pipeline.storage import get_bytes
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
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def ffmpeg_version() -> str:
    if not ffmpeg_available():
        return "not found"
    result = subprocess.run(
        ["ffmpeg", "-version"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.splitlines()[0] if result.stdout else "unknown"


def _find_timeline_schema() -> Path:
    """Locate timeline.v1.json by searching upward from this file.

    Robust to the schema living at different nesting depths in host vs. Docker
    (the old hardcoded parents[4] broke when the file layout changed).
    """
    start = Path(__file__).resolve()
    for parent in [start, *start.parents]:
        candidate = parent / "packages" / "timeline-schema" / "schema" / "timeline.v1.json"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "timeline.v1.json schema not found (searched upward from "
        f"{start}). Ensure packages/timeline-schema/schema is copied into the image."
    )


def validate_manifest(manifest: dict[str, Any]) -> None:
    """Fail fast: validate manifest schema + basic invariants."""
    from jsonschema import Draft7Validator

    schema_path = _find_timeline_schema()
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(manifest), key=lambda e: e.path)
    if errors:
        msg = "; ".join(f"{'/'.join(str(p) for p in e.path)}: {e.message}" for e in errors[:5])
        raise ValueError(f"Invalid timeline manifest: {msg}")

    duration = float(manifest["metadata"]["duration_sec"])
    if duration <= 0:
        raise ValueError("Invalid timeline duration_sec")

    video = manifest["tracks"]["video"]
    audio = manifest["tracks"]["audio"]

    # Ghost clips (empty src) — same failure mode VidRush docs call out.
    for clip in video:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost video clip {clip.get('id')}: empty src — replace or delete it")
    for clip in audio:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost audio clip {clip.get('id')}: empty src — replace or delete it")
    for clip in manifest.get("tracks", {}).get("broll") or []:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost b-roll clip {clip.get('id')}: empty src — replace or delete it")
    for clip in manifest.get("tracks", {}).get("music") or []:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost music/sfx clip {clip.get('id')}: empty src — replace or delete it")

    fps = int(manifest["metadata"]["fps"])
    if fps <= 0:
        raise ValueError("Invalid fps")
    end = max((float(c["start_sec"]) + float(c["duration_sec"]) for c in video), default=0.0)
    if end > duration + 1 / fps:
        raise ValueError(f"Video end ({end:.3f}s) exceeds absolute timeline duration ({duration:.3f}s)")
    for track in manifest.get("tracks", {}).values():
        for item in track:
            if float(item.get("start_sec", 0)) < 0 or float(item.get("duration_sec", 0)) <= 0:
                raise ValueError(f"Invalid time range for {item.get('id')}")


def render_manifest(manifest: dict, work_dir: Path, *, on_progress=None, cancel_event=None) -> Path:
    """Export using our absolute-time graphics and media engine."""
    from src.render.native_pipeline import render_manifest_native
    return render_manifest_native(manifest, work_dir, on_progress=on_progress, cancel_event=cancel_event)


def render_from_timeline_key(timeline_key: str, project_id: str, run_id: str, *,
                             on_progress=None, cancel_event=None) -> tuple[str, float]:
    """Render MP4 and return the existing Temporal artifact contract."""
    from src.pipeline.storage import put_file
    manifest = json.loads(get_bytes(timeline_key).decode("utf-8"))
    validate_manifest(manifest)
    with tempfile.TemporaryDirectory() as tmp:
        final_path = render_manifest(manifest, Path(tmp), on_progress=on_progress, cancel_event=cancel_event)
        duration_sec = _probe_duration(final_path)
        output_key = f"projects/{project_id}/runs/{run_id}/final.mp4"
        put_file(output_key, final_path, "video/mp4")
        return output_key, float(duration_sec)
