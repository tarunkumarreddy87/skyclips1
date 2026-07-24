"""HTTP client for the Remotion Lambda render-service."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

import httpx

from app.config import settings
from app.schemas.render import RenderJobResponse, RenderResultResponse, StartRenderResponse

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


class RenderServiceError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class RenderServiceClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        self.base_url = (base_url or settings.render_service_url).rstrip("/")
        self.api_key = api_key or settings.render_service_api_key
        self._headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            self._headers["X-Api-Key"] = self.api_key

    def _parse_job(self, data: dict[str, Any]) -> RenderJobResponse:
        return RenderJobResponse.model_validate(data)

    async def start_render(
        self,
        *,
        manifest: dict[str, Any],
        output_key: str,
        project_id: str,
        run_id: str,
        external_id: str | None = None,
    ) -> StartRenderResponse:
        payload = {
            "manifest": manifest,
            "outputKey": output_key,
            "projectId": project_id,
            "runId": run_id,
        }
        if external_id:
            payload["externalId"] = external_id

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/render/start",
                json=payload,
                headers=self._headers,
            )
            if resp.status_code >= 400:
                detail = resp.json().get("detail", resp.text) if resp.content else resp.text
                raise RenderServiceError(str(detail), status_code=resp.status_code)
            body = resp.json()
            return StartRenderResponse(
                render_id=body["renderId"],
                job=self._parse_job(body["job"]),
            )

    async def get_status(self, render_id: str) -> RenderJobResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/render/{render_id}/status",
                headers=self._headers,
            )
            if resp.status_code == 404:
                raise RenderServiceError("Render job not found", status_code=404, code="NOT_FOUND")
            resp.raise_for_status()
            return self._parse_job(resp.json()["job"])

    async def get_result(self, render_id: str) -> RenderResultResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/render/{render_id}/result",
                headers=self._headers,
            )
            if resp.status_code == 404:
                raise RenderServiceError("Render job not found", status_code=404, code="NOT_FOUND")
            if resp.status_code == 409:
                body = resp.json()
                job = self._parse_job(body.get("job", {}))
                raise RenderServiceError(
                    body.get("detail", "Render not complete"),
                    status_code=409,
                    code="NOT_READY",
                )
            resp.raise_for_status()
            return RenderResultResponse(job=self._parse_job(resp.json()["job"]))

    async def cancel(self, render_id: str) -> RenderJobResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.delete(
                f"{self.base_url}/render/{render_id}",
                headers=self._headers,
            )
            if resp.status_code == 404:
                raise RenderServiceError("Render job not found", status_code=404)
            resp.raise_for_status()
            return self._parse_job(resp.json()["job"])

    async def wait_for_completion(
        self,
        render_id: str,
        *,
        poll_interval_sec: float = 2.0,
        timeout_sec: float = 7200.0,
        on_progress: Callable[[int, str], None] | None = None,
    ) -> RenderJobResponse:
        """Poll until render completes, fails, or times out."""
        deadline = asyncio.get_event_loop().time() + timeout_sec
        last_progress = -1

        while asyncio.get_event_loop().time() < deadline:
            job = await self.get_status(render_id)
            if on_progress and job.progress != last_progress:
                last_progress = job.progress
                on_progress(job.progress, job.message)

            if job.status in TERMINAL_STATUSES:
                if job.status == "completed":
                    result = await self.get_result(render_id)
                    return result.job
                raise RenderServiceError(job.error or f"Render {job.status}", code=job.status.upper())

            await asyncio.sleep(poll_interval_sec)

        raise RenderServiceError("Render timed out", code="TIMEOUT")

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health", headers=self._headers)
                return resp.status_code == 200
        except Exception:
            return False
