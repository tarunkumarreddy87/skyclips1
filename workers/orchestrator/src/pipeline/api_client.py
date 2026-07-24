"""HTTP callbacks from orchestrator/media workers to API."""

from __future__ import annotations

import httpx

from src.config import settings


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
            await client.post(f"{self.base}/internal/progress-events", json=payload, headers=self.headers)

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
            response.raise_for_status()
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
            await client.post(
                f"{self.base}/internal/runs/{run_id}/status",
                json=payload,
                headers=self.headers,
            )
