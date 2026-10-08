"""Bake only Three.js clips; cache immutable source-time frames for native compositing."""
from __future__ import annotations
import copy
import hashlib
import json
import os
import subprocess
from pathlib import Path
from src.config import settings
from src.render import section_cache


def valid_video(path: Path, frames: int, width: int, height: int) -> bool:
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                 "stream=nb_frames,width,height", "-of", "json", str(path)],
                                capture_output=True, timeout=30, check=True)
        stream = json.loads(result.stdout)["streams"][0]
        return int(stream["nb_frames"]) == frames and stream["width"] == width and stream["height"] == height
    except (OSError, subprocess.SubprocessError, KeyError, ValueError, IndexError):
        return False


def prepare_three_clips(manifest: dict, work_dir: Path, runner, encoder: str, emit) -> dict:
    if not any(clip.get("three_scene") for name in ("video", "broll") for clip in manifest["tracks"].get(name, [])):
        return manifest
    result = copy.deepcopy(manifest)
    root = Path(__file__).resolve().parents[4]
    cli = root / "render-service/src/native/render-three.ts"
    tsx = root / "render-service/node_modules/tsx/dist/cli.mjs"
    if not cli.is_file() or not tsx.is_file():
        raise RuntimeError("Three.js export runtime unavailable; install render-service dependencies and Chromium")
    directory = work_dir / "three"
    directory.mkdir(parents=True, exist_ok=True)
    sources = [cli, root / "packages/video-engine/src/three-scene.ts", root / "packages/shared-types/src/three-scene.ts", root / "pnpm-lock.yaml"]
    digest = hashlib.sha256(b"".join(p.read_bytes() for p in sources)).hexdigest()
    fps = int(manifest["metadata"]["fps"])
    width, height = (int(manifest["metadata"]["resolution"][key]) for key in ("width", "height"))
    cache = Path(settings.render_cache_dir) if settings.render_cache_dir else None
    jobs, seen, records = [], {}, []
    for name in ("video", "broll"):
        for clip in result["tracks"].get(name, []):
            scene = clip.get("three_scene")
            if scene is None:
                continue
            if clip.get("motion_template"):
                raise ValueError("A clip cannot contain both a Three.js scene and a motion template")
            start, duration = float(clip["start_sec"]), float(clip["duration_sec"])
            frames = max(1, round((start + duration) * fps) - round(start * fps))
            offset = float(clip.get("source_start_sec", 0))
            fingerprint = hashlib.sha256(json.dumps({"runtime": digest, "scene": scene, "frames": frames,
                "offset": offset, "fps": fps, "width": width, "height": height, "encoder": encoder,
                "require_gpu": os.getenv("THREE_REQUIRE_GPU", "0"), "capture": os.getenv("THREE_CAPTURE_MODE", "auto"),
                "angle": os.getenv("THREE_ANGLE_BACKEND", "auto")}, sort_keys=True).encode()).hexdigest()
            output = directory / f"{fingerprint}.mp4"
            if fingerprint not in seen:
                hit = bool(cache and section_cache.load(cache, fingerprint, output) and valid_video(output, frames, width, height))
                if not hit:
                    jobs.append({"scene": scene, "width": width, "height": height, "fps": fps,
                                 "frames": frames, "offset": offset, "output": str(output.resolve()), "fingerprint": fingerprint})
                seen[fingerprint] = hit
            records.append({"clip": clip["id"], "cache_hit": seen[fingerprint], "frames": frames})
            clip.pop("three_scene")
            clip.update(src=str(output.resolve()), type="video", source_start_sec=0, muted=True)
    if jobs:
        emit(3, f"Rendering {len(jobs)} Three.js scene(s); cached scenes are reused")
        batch = directory / "batch.json"
        request = {"jobs": jobs, "encoder": encoder, "metrics": str((directory / "metrics.json").resolve())}
        batch.write_text(json.dumps(request), encoding="utf-8")
        command = ["node", str(tsx), str(cli), str(batch.resolve())]
        try:
            runner.run(command)
        except RuntimeError as error:
            if runner.cancel.is_set() or os.getenv("THREE_CAPTURE_MODE", "auto") != "auto":
                raise
            # Capability probes can succeed before a device/driver rejects encoding.
            # Retry once with bounded raw frames; never replace a failed 3D scene with footage.
            emit(4, "Retrying Three.js scenes with FFmpeg frame capture")
            (directory / "fallback.json").write_text(json.dumps({"reason": str(error)}), encoding="utf-8")
            request["capture_mode"] = "raw"
            batch.write_text(json.dumps(request), encoding="utf-8")
            runner.run(command)
        for job in jobs:
            output = Path(job["output"])
            if not valid_video(output, job["frames"], width, height):
                raise RuntimeError("Three.js output frame count or resolution is incomplete")
            if cache:
                section_cache.save(cache, job["fingerprint"], output, settings.render_cache_max_bytes, settings.render_cache_ttl_sec)
        metrics = json.loads((directory / "metrics.json").read_text(encoding="utf-8"))
        software = any(any(label in job.get("backend", "").lower() for label in ("swiftshader", "llvmpipe", "software")) for job in metrics.get("jobs", []))
        emit(5, "Three.js scenes ready (software graphics fallback)" if software else "Three.js scenes ready")
    (directory / "cache.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    return result
