"""HTTP callbacks from orchestrator/media workers to API."""

from __future__ import annotations

import logging

import httpx
from temporalio.exceptions import ApplicationError

from src.config import settings

logger = logging.getLogger(__name__)

# Statuses worth retrying (API overloaded, restarting, or a dependency briefly down).
_RETRYABLE_STATUS = frozenset({408, 429})


def _raise_for_api_status(response: httpx.Response, action: str) -> None:
    """Map a non-2xx API response onto Temporal retry semantics.

    408/429/5xx raise a retryable error so the activity retry policy tries again.
    Any other status (401/404/422, unexpected redirects) can never succeed on
    retry, so it is raised as non-retryable instead of retrying indefinitely.
    httpx transport errors are not caught here and stay retryable.
    """
    if response.is_success:
        return
    status = response.status_code
    message = f"API {action} failed (HTTP {status}): {response.text[:300]}"
    if status in _RETRYABLE_STATUS or status >= 500:
        raise ApplicationError(message, type="ApiCallbackUnavailable")
    raise ApplicationError(message, type="ApiCallbackRejected", non_retryable=True)


class ApiClient:
    def __init__(self) -> None:
        self.base = settings.api_base_url.rstrip("/")
        self.headers = {"X-Internal-Key": settings.internal_api_key, "Content-Type": "application/json"}

    async def emit_progress(
        self,
        *,
        run_id: str,
        project_id: str,
        stage: str,
        status: str,
        message: str,
        percent: int | None = None,
        artifact_id: str | None = None,
        artifact_type: str | None = None,
    ) -> None:
        payload = {
            "runId": run_id,
            "projectId": project_id,
            "stage": stage,
            "status": status,
            "message": message,
            "percent": percent,
            "artifactId": artifact_id,
            "artifactType": artifact_type,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self.base}/internal/progress-events", json=payload, headers=self.headers)
        if not response.is_success:
            # Progress is best-effort UX; never fail an activity over a dropped event.
            logger.warning(
                "Progress event rejected by API (HTTP %s) run=%s stage=%s status=%s: %s",
                response.status_code,
                run_id,
                stage,
                status,
                response.text[:300],
            )

    async def register_artifact(
        self,
        *,
        project_id: str,
        run_id: str,
        artifact_type: str,
        s3_key: str,
        content_type: str,
        size_bytes: int | None = None,
        metadata: dict | None = None,
    ) -> str:
        payload = {
            "projectId": project_id,
            "runId": run_id,
            "type": artifact_type,
            "s3Key": s3_key,
            "contentType": content_type,
            "sizeBytes": size_bytes,
            "metadata": metadata or {},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self.base}/internal/artifacts", json=payload, headers=self.headers)
            _raise_for_api_status(response, "register_artifact")
            return response.json()["artifactId"]

    async def update_run_status(
        self,
        run_id: str,
        *,
        status: str,
        current_stage: str | None = None,
        error_message: str | None = None,
        project_status: str | None = None,
    ) -> None:
        payload = {
            "status": status,
            "currentStage": current_stage,
            "errorMessage": error_message,
            "projectStatus": project_status,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base}/internal/runs/{run_id}/status",
                json=payload,
                headers=self.headers,
            )
            _raise_for_api_status(response, "update_run_status")
