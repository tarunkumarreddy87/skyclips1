"""Optional subject extraction for templates; preserve full-frame source media."""
import asyncio
import copy
import httpx
from src.config import settings
from src.pipeline.storage import artifact_key, put_json

async def prepare_template_cutouts(scenes: list[dict], visual_sections: dict, ctx: dict) -> list[dict]:
    results = []
    for scene in scenes:
        visual = visual_sections.get(str(scene.get("section_id") or "")) or {}
        template = scene.get("selected_uploaded_template")
        if visual.get("removeBackground") is not True or scene.get("agent_three_scene") or not (template or scene.get("motion_graphics_template")):
            continue
        source = str((scene.get("asset_ref") or {}).get("s3_key") or "")
        if not source.startswith(f"projects/{ctx['project_id']}/") or not source.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            results.append({"scene_id": scene["id"], "status": "unsupported", "reason": "Only owned still subjects supported"})
            continue
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(f"{settings.api_base_url.rstrip('/')}/projects/internal/{ctx['project_id']}/remove-background",
                    headers={"X-Internal-Key": settings.internal_api_key}, json={"sourceKey": source})
                response.raise_for_status()
                data = response.json()
            key = data.get("s3Key", "")
            if not data.get("transparent") or not key.startswith(f"projects/{ctx['project_id']}/cutouts/") or not key.endswith(".png"):
                raise ValueError("Cutout service returned an invalid scoped asset")
            scene["subject_asset_ref"] = {**scene["asset_ref"], "s3_key": key, "original_s3_key": source}
            if template:
                scene["selected_uploaded_template"] = copy.deepcopy(template)
                assets = scene["selected_uploaded_template"].setdefault("assets", [])
                subject = next((a for a in assets if a.get("key") == "subject"), None)
                if subject: subject["url"] = key
                else: assets.append({"key": "subject", "kind": "image", "url": key, "required": False})
            results.append({"scene_id": scene["id"], "status": "completed", "originalKey": source, "s3Key": key})
        except Exception as exc:
            results.append({"scene_id": scene["id"], "status": "failed", "originalKey": source,
                            "reason": str(exc)[:300]})
    if results:
        await asyncio.to_thread(put_json, artifact_key(ctx["project_id"], ctx["run_id"], "agent-cutout-plan.json"), {"results": results})
    return results
