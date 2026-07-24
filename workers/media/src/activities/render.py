import asyncio
import json
import logging
import time

import httpx
from temporalio import activity

from src.config import settings
from src.pipeline.storage import get_bytes
from src.render.engine_select import resolve_render_engine
from src.render.ffmpeg_pipeline import render_from_timeline_key, validate_manifest
from src.render.render_service_client import render_with_render_service

logger = logging.getLogger(__name__)

# Remotion can emit progress many times per second; throttle SSE fan-out so the
# activity event loop can still heartbeat (Temporal cancels after heartbeat_timeout).
_PROGRESS_MIN_INTERVAL_SEC = 2.0


async def _heartbeat_loop(interval_sec: float = 20.0) -> None:
    """Keep Temporal from killing long encodes (heartbeat_timeout is ~2–4 min)."""
    while True:
        try:
            activity.heartbeat("rendering")
        except Exception:
            return
        await asyncio.sleep(interval_sec)


def _emit_progress_sync(
    *,
    base: str,
    headers: dict[str, str],
    payload: dict,
    percent: int,
    message: str,
    status: str = "started",
) -> None:
    """Sync HTTP from the Remotion bridge thread — avoids flooding the asyncio loop."""
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(
                f"{base}/internal/progress-events",
                json={
                    "runId": payload["run_id"],
                    "projectId": payload["project_id"],
                    "stage": "enqueue_render",
                    "status": status,
                    "message": message,
                    "percent": percent,
                },
                headers=headers,
            )
    except Exception:
        logger.debug("progress emit failed percent=%s", percent, exc_info=True)


def _throttled_progress_emitter(
    base: str,
    headers: dict[str, str],
    payload: dict,
):
    last_emit = 0.0

    def on_progress(percent: int, message: str) -> None:
        nonlocal last_emit
        now = time.monotonic()
        # Always emit near finish so UI sees 97–99.
        if now - last_emit < _PROGRESS_MIN_INTERVAL_SEC and percent < 97:
            return
        last_emit = now
        _emit_progress_sync(
            base=base,
            headers=headers,
            payload=payload,
            percent=percent,
            message=message,
        )

    return on_progress


@activity.defn(name="render_video")
async def render_video(payload: dict) -> str:
    headers = {"X-Internal-Key": settings.internal_api_key, "Content-Type": "application/json"}
    base = settings.api_base_url.rstrip("/")
    timeline_key = payload["timeline_key"]
    duration_sec: float | None = None

    manifest = json.loads(get_bytes(timeline_key).decode("utf-8"))
    # Preflight for Remotion and FFmpeg — fail fast on ghost/empty clips.
    validate_manifest(manifest)
    engine, decision = resolve_render_engine(
        settings.render_engine,
        manifest,
        render_service_configured=bool(settings.render_service_url),
    )
    activity.logger.info(
        "Rendering timeline %s configured=%s effective=%s decision=%s",
        timeline_key,
        settings.render_engine,
        engine,
        decision,
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(
            f"{base}/internal/progress-events",
            json={
                "runId": payload["run_id"],
                "projectId": payload["project_id"],
                "stage": "enqueue_render",
                "status": "started",
                "message": f"Rendering your video ({engine})",
                "percent": 85,
            },
            headers=headers,
        )

        activity.heartbeat("render_start")
        hb_task = asyncio.create_task(_heartbeat_loop())
        try:
            if engine.startswith("remotion"):
                on_progress = _throttled_progress_emitter(base, headers, payload)
                try:
                    if engine == "remotion-lambda":
                        output_key, duration_sec = await asyncio.to_thread(
                            render_with_render_service,
                            timeline_key=timeline_key,
                            project_id=payload["project_id"],
                            run_id=payload["run_id"],
                            on_progress=on_progress,
                        )
                    else:
                        from src.render.remotion_bridge import render_with_remotion

                        output_key, duration_sec = await asyncio.to_thread(
                            render_with_remotion,
                            timeline_key=timeline_key,
                            project_id=payload["project_id"],
                            run_id=payload["run_id"],
                            engine=engine,
                            on_progress=on_progress,
                        )
                except Exception as remotion_exc:
                    if not settings.render_ffmpeg_fallback:
                        raise
                    activity.logger.warning(
                        "Remotion render failed (%s); falling back to FFmpeg",
                        remotion_exc,
                    )
                    await client.post(
                        f"{base}/internal/progress-events",
                        json={
                            "runId": payload["run_id"],
                            "projectId": payload["project_id"],
                            "stage": "enqueue_render",
                            "status": "started",
                            "message": "Remotion unavailable — falling back to FFmpeg",
                            "percent": 86,
                        },
                        headers=headers,
                    )
                    output_key, duration_sec = await asyncio.to_thread(
                        render_from_timeline_key,
                        timeline_key,
                        payload["project_id"],
                        payload["run_id"],
                    )
            else:
                output_key, duration_sec = await asyncio.to_thread(
                    render_from_timeline_key,
                    timeline_key,
                    payload["project_id"],
                    payload["run_id"],
                )
        finally:
            hb_task.cancel()
            try:
                await hb_task
            except asyncio.CancelledError:
                pass

        activity.heartbeat("render_upload")
        await client.post(
            f"{base}/internal/progress-events",
            json={
                "runId": payload["run_id"],
                "projectId": payload["project_id"],
                "stage": "enqueue_render",
                "status": "started",
                "message": "Uploading final video",
                "percent": 99,
            },
            headers=headers,
        )
        meta: dict = {}
        if duration_sec and duration_sec > 0:
            meta["duration_sec"] = round(float(duration_sec), 3)
        artifact_resp = await client.post(
            f"{base}/internal/artifacts",
            json={
                "projectId": payload["project_id"],
                "runId": payload["run_id"],
                "type": "final_video",
                "s3Key": output_key,
                "contentType": "video/mp4",
                "metadata": meta,
            },
            headers=headers,
        )
        artifact_resp.raise_for_status()

    return output_key
