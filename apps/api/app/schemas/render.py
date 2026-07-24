"""Pydantic schemas for render service API."""

from typing import Any

from pydantic import BaseModel, Field


class StartRenderRequest(BaseModel):
    manifest: dict[str, Any]
    output_key: str = Field(alias="outputKey")
    project_id: str = Field(alias="projectId")
    run_id: str = Field(alias="runId")
    external_id: str | None = Field(default=None, alias="externalId")

    model_config = {"populate_by_name": True}


class RenderJobResponse(BaseModel):
    id: str
    status: str
    project_id: str = Field(alias="projectId")
    run_id: str = Field(alias="runId")
    output_key: str = Field(alias="outputKey")
    progress: int
    message: str
    cost_usd: float | None = Field(alias="costUsd")
    error: str | None = None
    retry_count: int = Field(alias="retryCount")
    remotion_render_id: str | None = Field(default=None, alias="remotionRenderId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    started_at: str | None = Field(default=None, alias="startedAt")
    completed_at: str | None = Field(default=None, alias="completedAt")
    duration_sec: float | None = Field(default=None, alias="durationSec")
    output_url: str | None = Field(default=None, alias="outputUrl")
    artifact_url: str | None = Field(default=None, alias="artifactUrl")

    model_config = {"populate_by_name": True}


class StartRenderResponse(BaseModel):
    render_id: str = Field(alias="renderId")
    job: RenderJobResponse

    model_config = {"populate_by_name": True}


class RenderStatusResponse(BaseModel):
    job: RenderJobResponse


class RenderResultResponse(BaseModel):
    job: RenderJobResponse
