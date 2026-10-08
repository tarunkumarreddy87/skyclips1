"""Bake only trusted HTML/GSAP clips; cache immutable source frames for native compositing."""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import mimetypes
from pathlib import Path

from src.config import settings
from src.render import section_cache
from src.render.three_pipeline import valid_video

PRESS_CUTOUT_TEMPLATE_ID = "press-cutout-v1"


def is_builtin(clip: dict) -> bool:
    template = (clip.get("motion_template") or {}).get("html_template") or {}
    return template.get("id") == PRESS_CUTOUT_TEMPLATE_ID or bool(template.get("js") and template.get("html"))


def prepare_html_clips(manifest: dict, work_dir: Path, runner, encoder: str, emit) -> dict:
    if not any(is_builtin(clip) for name in ("video", "broll") for clip in manifest["tracks"].get(name, [])):
        return manifest
    from src.render.native_pipeline import stage_assets
    result = copy.deepcopy(manifest)
    root = Path(__file__).resolve().parents[4]
    cli = root / "render-service/src/native/render-html.ts"
    tsx = root / "render-service/node_modules/tsx/dist/cli.mjs"
    if not cli.is_file() or not tsx.is_file():
        raise RuntimeError("HTML motion export runtime unavailable; install render-service dependencies and Chromium")
    directory = work_dir / "html-motion"
    directory.mkdir(parents=True, exist_ok=True)
    assets_dir = directory / "assets"
    assets_dir.mkdir(exist_ok=True)
    sources = [cli, root / "packages/video-engine/src/press-cutout.ts", root / "packages/video-engine/src/uploaded-template.ts", root / "packages/video-engine/vendor/gsap.min.js", Path(__file__)]
    sources.extend(sorted((root / "packages/video-engine/fonts").glob("*.ttf")))
    digest = hashlib.sha256(b"".join(p.read_bytes() for p in sources)).hexdigest()
    fps = int(manifest["metadata"]["fps"])
    width, height = (int(manifest["metadata"]["resolution"][key]) for key in ("width", "height"))
    cache = Path(settings.render_cache_dir) if settings.render_cache_dir else None
    images: dict[str, str] = {}

    def embed(source: str, *, video: bool = False, offset: float = 0) -> str:
        if not source or source.startswith("color:"):
            return ""
        if source.startswith("data:image/"):
            return source
        key = f"{source}|{video}|{offset}"
        if key in images:
            return images[key]
        local = source
        # Built-in preview images may be packaged with the engine. Project media uses normal storage staging.
        if source.startswith("/") and not Path(source).is_file():
            for base in (root / "apps/web/public", root / "packages/video-engine/public"):
                target = (base / source.lstrip("/")).resolve()
                if target.is_relative_to(base.resolve()) and target.is_file():
                    local = str(target)
                    break
        path = stage_assets({"tracks": {"video": [{"src": local}]}}, assets_dir)[local]
        # Legacy template insertion labels the rendered composition as an image,
        # even when its underlying source is footage. Inspect the staged source.
        source_mime = mimetypes.guess_type(path.name)[0] or ""
        if video or source_mime.startswith("video/"):
            poster = assets_dir / (hashlib.sha256(key.encode()).hexdigest() + ".png")
            runner.ffmpeg(["-ss", str(offset), "-i", str(path), "-frames:v", "1", str(poster)])
            path = poster
        if path.stat().st_size > 24 * 1024 * 1024:
            raise ValueError("Motion template image exceeds 24 MB")
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        if not mime.startswith("image/"):
            raise ValueError("Motion template subject must be an image")
        images[key] = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
        return images[key]

    jobs, seen, records = [], {}, []
    for name in ("video", "broll"):
        for clip in result["tracks"].get(name, []):
            if not is_builtin(clip):
                continue
            if clip.get("three_scene"):
                raise ValueError("A clip cannot contain both a Three.js scene and an HTML template")
            motion = clip["motion_template"]
            template = motion["html_template"]
            start, duration = float(clip["start_sec"]), float(clip["duration_sec"])
            frames = max(1, round((start + duration) * fps) - round(start * fps))
            offset = max(0, float(clip.get("source_start_sec", 0)))
            scene = {key: value for key, value in motion.items() if key not in {"html_template", "layer_edits"}}
            asset_specs = copy.deepcopy(template.get("assets", []))
            # Resolve footage first, so an unused demo image never becomes an export dependency.
            selected_subject = next((a for a in asset_specs if a.get("key") == "subject" and a.get("url")), None)
            subject_source = str(selected_subject["url"]) if selected_subject else str(clip.get("src", ""))
            subject = embed(subject_source, video=not selected_subject and clip.get("type") == "video", offset=offset)
            if subject:
                asset_specs = [a for a in asset_specs if a.get("key") != "subject"]
            for asset in asset_specs:
                if asset.get("kind") == "image" and asset.get("url"):
                    asset["url"] = embed(asset["url"])
            # Real selected footage replaces the demo asset. A video contributes a still at the trim point.
            if subject:
                scene["imageUrl"] = subject
                asset_specs.append({"key":"subject", "kind":"image", "url":subject, "required":True})
            job = {"templateId":template["id"], "template":template, "scene":scene, "assets":asset_specs,
                   "edits":motion.get("layer_edits", {}), "durationSec":float(template.get("durationSec", duration)),
                   "frames":frames, "offset":offset, "fps":fps, "width":width, "height":height}
            fingerprint = hashlib.sha256(json.dumps({"runtime":digest, "job":job, "encoder":encoder}, sort_keys=True).encode()).hexdigest()
            output = directory / f"{fingerprint}.mp4"
            if fingerprint not in seen:
                hit = bool(cache and section_cache.load(cache, fingerprint, output) and valid_video(output, frames, width, height))
                if not hit:
                    jobs.append({**job, "output":str(output.resolve()), "fingerprint":fingerprint})
                seen[fingerprint] = hit
            records.append({"clip":clip["id"], "cache_hit":seen[fingerprint], "frames":frames})
            clip.pop("motion_template")
            clip.update(src=str(output.resolve()), type="video", source_start_sec=0, muted=True)
    if jobs:
        emit(3, f"Rendering {len(jobs)} HTML motion scene(s); cached scenes are reused")
        batch = directory / "batch.json"
        batch.write_text(json.dumps({"jobs":jobs, "encoder":encoder, "metrics":str((directory / "metrics.json").resolve())}), encoding="utf-8")
        runner.run(["node", str(tsx), str(cli), str(batch.resolve())])
        for job in jobs:
            output = Path(job["output"])
            if not valid_video(output, job["frames"], width, height):
                raise RuntimeError("HTML motion output frame count or resolution is incomplete")
            if cache:
                section_cache.save(cache, job["fingerprint"], output, settings.render_cache_max_bytes, settings.render_cache_ttl_sec)
    (directory / "cache.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    return result
