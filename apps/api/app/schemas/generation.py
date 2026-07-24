from typing import Any

from pydantic import Field

from app.schemas.common import ApiModel


class GenerationRunResponse(ApiModel):
    id: str
    project_id: str = Field(serialization_alias="projectId")
    quote_id: str = Field(serialization_alias="quoteId")
    status: str
    current_stage: str | None = Field(default=None, serialization_alias="currentStage")
    temporal_run_id: str | None = Field(default=None, serialization_alias="temporalRunId")
    error_message: str | None = Field(default=None, serialization_alias="errorMessage")
    started_at: str | None = Field(default=None, serialization_alias="startedAt")
    completed_at: str | None = Field(default=None, serialization_alias="completedAt")


class StartGenerationResponse(ApiModel):
    run: GenerationRunResponse
    workflow_id: str = Field(serialization_alias="workflowId")


class BrandCompliancePayload(ApiModel):
    """Optional Brand Profile compliance flags (client localStorage → worker)."""

    disable_overlays: bool = Field(default=False, alias="disableOverlays")
    disable_animations: bool = Field(default=False, alias="disableAnimations")
    blocklisted_transitions: list[str] = Field(
        default_factory=list,
        alias="blocklistedTransitions",
    )


class StartGenerationRequest(ApiModel):
    brand_compliance: BrandCompliancePayload | None = Field(
        default=None,
        alias="brandCompliance",
    )


class RenderTimelineRequest(ApiModel):
    timeline_manifest: dict[str, Any] | None = Field(default=None, alias="timelineManifest")


class ProgressEventResponse(ApiModel):
    id: str
    run_id: str = Field(serialization_alias="runId")
    project_id: str = Field(serialization_alias="projectId")
    stage: str
    status: str
    percent: int | None = None
    message: str
    artifact_id: str | None = Field(default=None, serialization_alias="artifactId")
    artifact_type: str | None = Field(default=None, serialization_alias="artifactType")
    timestamp: str


class ArtifactResponse(ApiModel):
    id: str
    project_id: str = Field(serialization_alias="projectId")
    run_id: str | None = Field(default=None, serialization_alias="runId")
    type: str
    download_url: str = Field(serialization_alias="downloadUrl")
    content_type: str = Field(serialization_alias="contentType")
    duration_sec: float | None = Field(default=None, serialization_alias="durationSec")
    metadata: dict | None = None


class TimelineResponse(ApiModel):
    artifact_id: str = Field(serialization_alias="artifactId")
    manifest: dict
    media_urls: dict[str, str] = Field(serialization_alias="mediaUrls")
    editor_document: dict[str, Any] | None = Field(default=None, serialization_alias="editorDocument")
    snapshot_id: str | None = Field(default=None, serialization_alias="snapshotId")


class TimelineSnapshotMeta(ApiModel):
    id: str
    label: str
    action_type: str = Field(serialization_alias="actionType")
    is_original: bool = Field(serialization_alias="isOriginal")
    created_at: str = Field(serialization_alias="createdAt")


class SaveTimelineRequest(ApiModel):
    timeline_manifest: dict[str, Any] = Field(alias="timelineManifest")
    editor_document: dict[str, Any] = Field(alias="editorDocument")
    label: str | None = None
    action_type: str = Field(default="autosave", alias="actionType")


class SaveTimelineResponse(ApiModel):
    snapshot: TimelineSnapshotMeta
    history: list[TimelineSnapshotMeta]


class RestoreSnapshotResponse(ApiModel):
    snapshot: TimelineSnapshotMeta
    editor_document: dict[str, Any] = Field(serialization_alias="editorDocument")
    timeline_manifest: dict[str, Any] = Field(serialization_alias="timelineManifest")
    media_urls: dict[str, str] = Field(serialization_alias="mediaUrls")
    history: list[TimelineSnapshotMeta]


class InternalProgressEventRequest(ApiModel):
    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    stage: str
    status: str
    percent: int | None = None
    message: str
    artifact_id: str | None = Field(default=None, alias="artifactId")
    artifact_type: str | None = Field(default=None, alias="artifactType")


class InternalArtifactRequest(ApiModel):
    project_id: str = Field(alias="projectId")
    run_id: str = Field(alias="runId")
    type: str
    s3_key: str = Field(alias="s3Key")
    content_type: str = Field(alias="contentType")
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    metadata: dict | None = None


class InternalRunStatusRequest(ApiModel):
    status: str
    current_stage: str | None = Field(default=None, alias="currentStage")
    error_message: str | None = Field(default=None, alias="errorMessage")
    project_status: str | None = Field(default=None, alias="projectStatus")
