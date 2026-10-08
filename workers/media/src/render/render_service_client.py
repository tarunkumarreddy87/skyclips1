"""HTTP client for render-service — used by the media worker (native cloud workers)."""

from __future__ import annotations

import json
import logging
import time
from threading import Event
from collections.abc import Callable

import httpx

from src.config import settings
from src.pipeline.storage import get_bytes

logger = logging.getLogger(__name__)

ProgressCb = Callable[[int, str], None]

TERMINAL = frozenset({"completed", "failed", "cancelled"})

# A 404 while polling means render-service lost the job (e.g. in-memory store restart).
_NOT_FOUND = frozenset({404})
_MAX_LOST_JOB_RESUBMITS = 2

class RenderFatalError(RuntimeError):
    """Non-retriable native render or request validation failure."""


class RenderCancelledError(RuntimeError):
    """The owning activity stopped; do not keep polling in its worker thread."""


def _request_with_retry(client, method: str, url: str, *, deadline: float,
                        cancel_event: Event | None = None,
                        passthrough_status: frozenset[int] = frozenset(), **kwargs) -> httpx.Response:
    """Retry transient failures; statuses in ``passthrough_status`` are returned to the caller."""
    for attempt in range(8):
        if cancel_event and cancel_event.is_set():
            raise RenderCancelledError("Render activity stopped")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RenderFatalError("Render service deadline exceeded")
        try:
            response = client.request(method, url, timeout=httpx.Timeout(
                min(120.0, remaining), connect=min(30.0, remaining)), **kwargs)
            if response.status_code in passthrough_status:
                return response
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in (408, 429, 500, 502, 503, 504):
                raise RenderFatalError(f"Render service rejected request (HTTP {exc.response.status_code})") from exc
            if attempt == 7:
                raise
        except httpx.TransportError:
            if attempt == 7:
                raise
        delay = min(8.0, 0.5 * 2 ** attempt, max(0.0, deadline - time.monotonic()))
        if cancel_event:
            if cancel_event.wait(delay):
                raise RenderCancelledError("Render activity stopped")
        else:
            time.sleep(delay)
    raise AssertionError("unreachable")



def render_with_render_service(
    *,
    timeline_key: str,
    project_id: str,
    run_id: str,
    on_progress: ProgressCb | None = None,
    cancel_event: Event | None = None,
) -> tuple[str, float]:
    """Render via render-service (native engine) and return (s3_key, duration_sec)."""
    if cancel_event and cancel_event.is_set():
        raise RenderCancelledError("Render activity stopped")
    base = settings.render_service_url.rstrip("/")
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.render_service_api_key:
        headers["X-Api-Key"] = settings.render_service_api_key

    manifest = json.loads(get_bytes(timeline_key).decode("utf-8"))
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
    deadline = time.monotonic() + settings.render_service_timeout_sec
    with httpx.Client(timeout=timeout) as client:
        render_id: str | None = None

        def cancel_remote():
            if render_id:
                try:
                    client.delete(f"{base}/render/{render_id}", headers=headers, timeout=10)
                except httpx.HTTPError:
                    logger.warning("Could not cancel remote render %s", render_id)

        def request(method: str, path: str, **kwargs):
            try:
                return _request_with_retry(client, method, f"{base}{path}", deadline=deadline,
                                           cancel_event=cancel_event, headers=headers, **kwargs)
            except (RenderCancelledError, RenderFatalError):
                cancel_remote()
                raise

        def submit() -> str:
            # Same externalId on retry: a lost HTTP response must not buy a second render.
            resp = request("POST", "/render/start", json=payload)
            return resp.json()["renderId"]

        logger.info("render-service: POST /render/start project=%s run=%s", project_id, run_id)
        render_id = submit()
        logger.info("render-service: job queued renderId=%s", render_id)

        last_pct = -1
        resubmits = 0

        while time.monotonic() < deadline:
            if cancel_event and cancel_event.is_set():
                cancel_remote()
                raise RenderCancelledError("Render activity stopped")
            status_resp = request("GET", f"/render/{render_id}/status", passthrough_status=_NOT_FOUND)
            if status_resp.status_code == 404:
                # Job record lost (e.g. in-memory store restarted): submit the same payload again.
                if resubmits >= _MAX_LOST_JOB_RESUBMITS:
                    raise RenderFatalError(
                        f"render-service lost render {render_id} after {resubmits} resubmission(s)"
                    )
                resubmits += 1
                logger.warning(
                    "render-service: renderId=%s not found; resubmitting (%d/%d)",
                    render_id,
                    resubmits,
                    _MAX_LOST_JOB_RESUBMITS,
                )
                render_id = submit()
                logger.info("render-service: job re-queued renderId=%s", render_id)
                continue
            job = status_resp.json()["job"]
            pct = int(job.get("progress") or 0)
            msg = str(job.get("message") or "Rendering")
            status = job.get("status")

            if on_progress and pct != last_pct:
                last_pct = pct
                on_progress(pct, msg)

            if status in TERMINAL:
                if status == "completed":
                    result_resp = request("GET", f"/render/{render_id}/result")
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
                # A terminal remote job stays terminal. Retrying the activity cannot fix it.
                raise RenderFatalError(f"render-service {status}: {error}")

            if cancel_event:
                cancel_event.wait(settings.render_service_poll_interval_sec)
            else:
                time.sleep(settings.render_service_poll_interval_sec)

        cancel_remote()
        raise RenderFatalError(f"render-service timed out after {settings.render_service_timeout_sec}s")
