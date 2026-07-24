"""HTTP client for render-service — used by the media worker (Remotion Lambda only)."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

from src.config import settings
from src.pipeline.storage import get_bytes, presigned_download_url

logger = logging.getLogger(__name__)

ProgressCb = Callable[[int, str], None]

TERMINAL = frozenset({"completed", "failed", "cancelled"})


def _hydrate_manifest_urls(manifest: dict[str, Any]) -> dict[str, Any]:
    """Replace S3 object keys in clip src fields with presigned HTTP URLs for Remotion."""
    hydrated = json.loads(json.dumps(manifest))
    tracks = hydrated.get("tracks", {})
    for track_name in ("video", "audio", "broll", "music"):
        for clip in tracks.get(track_name, []):
            src = clip.get("src")
            if not isinstance(src, str) or not src:
                continue
            if src.startswith(("http://", "https://", "color:", "static:")):
                continue
            clip["src"] = presigned_download_url(src)
    return hydrated


def render_with_render_service(
    *,
    timeline_key: str,
    project_id: str,
    run_id: str,
    on_progress: ProgressCb | None = None,
) -> tuple[str, float]:
    """Render via render-service (Remotion Lambda) and return (s3_key, duration_sec)."""
    base = settings.render_service_url.rstrip("/")
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.render_service_api_key:
        headers["X-Api-Key"] = settings.render_service_api_key

    manifest = _hydrate_manifest_urls(json.loads(get_bytes(timeline_key).decode("utf-8")))
    output_key = f"projects/{project_id}/runs/{run_id}/final.mp4"
    external_id = f"{project_id}:{run_id}"

    payload = {
        "manifest": manifest,
        "outputKey": output_key,
        "projectId": project_id,
        "runId": run_id,
        "externalId": external_id,
    }

    timeout = httpx.Timeout(30.0, read=120.0)
    with httpx.Client(timeout=timeout) as client:
        logger.info("render-service: POST /render/start project=%s run=%s", project_id, run_id)
        resp = client.post(f"{base}/render/start", json=payload, headers=headers)
        if resp.status_code >= 400:
            detail = resp.json().get("detail", resp.text) if resp.content else resp.text
            raise RuntimeError(f"render-service start failed: {detail}")

        render_id = resp.json()["renderId"]
        logger.info("render-service: job queued renderId=%s", render_id)

        deadline = time.monotonic() + settings.render_service_timeout_sec
        last_pct = -1

        while time.monotonic() < deadline:
            status_resp = client.get(f"{base}/render/{render_id}/status", headers=headers)
            status_resp.raise_for_status()
            job = status_resp.json()["job"]
            pct = int(job.get("progress") or 0)
            msg = str(job.get("message") or "Rendering")
            status = job.get("status")

            if on_progress and pct != last_pct:
                last_pct = pct
                on_progress(pct, msg)

            if status in TERMINAL:
                if status == "completed":
                    result_resp = client.get(f"{base}/render/{render_id}/result", headers=headers)
                    result_resp.raise_for_status()
                    result_job = result_resp.json()["job"]
                    duration = result_job.get("durationSec") or manifest.get("metadata", {}).get(
                        "duration_sec", 0
                    )
                    logger.info(
                        "render-service: completed renderId=%s cost=%s",
                        render_id,
                        result_job.get("costUsd"),
                    )
                    return output_key, float(duration or 0)

                error = job.get("error") or f"Render {status}"
                raise RuntimeError(f"render-service failed: {error}")

            time.sleep(settings.render_service_poll_interval_sec)

        raise RuntimeError(f"render-service timed out after {settings.render_service_timeout_sec}s")
