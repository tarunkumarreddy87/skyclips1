from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.motion_templates import UploadedMotionTemplate


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


class ChannelMotionGraphics(ApiModel):
    enabled: bool = False
    mode: Literal["selected", "auto", "custom", "none"] = "selected"
    selected_template_ids: list[str] = Field(default_factory=list, alias="selectedTemplateIds", max_length=10)
    template_id: Literal["press-cutout-v1"] = Field(default="press-cutout-v1", alias="templateId")
    sound_enabled: bool = Field(default=True, alias="soundEnabled")
    intensity: Literal["subtle", "cinematic"] = "cinematic"


class BrandCompliancePayload(ApiModel):
    """Optional Brand Profile compliance flags (client localStorage → worker)."""

    profile_id: str | None = Field(default=None, alias="profileId", max_length=128)
    theme_id: str | None = Field(default=None, alias="themeId", max_length=32)
    language: str | None = Field(default=None, max_length=16)
    caption_script: str = Field(default="latin", alias="captionScript", pattern=r"^(latin|native)$")
    ai_generated_images: bool = Field(default=False, alias="aiGeneratedImages")
    image_model: str | None = Field(default=None, alias="imageModel", max_length=128)
    voice_id: str | None = Field(default=None, alias="voiceId", max_length=128)
    uploaded_templates: list[UploadedMotionTemplate] = Field(default_factory=list, alias="uploadedTemplates", max_length=10)
    motion_graphics: ChannelMotionGraphics | None = Field(default=None, alias="motionGraphics")
    disable_effects: bool = Field(default=False, alias="disableEffects")
    background_color: str | None = Field(default=None, alias="backgroundColor", pattern=r"^#[0-9a-fA-F]{6}$")
    commercial_stock: bool = Field(default=True, alias="commercialStock")
    cc_public_domain: bool = Field(default=False, alias="ccPublicDomain")
    general_web_crawling: bool = Field(default=False, alias="generalWebCrawling")
    blacklisted_webpages: list[str] = Field(default_factory=list, alias="blacklistedWebpages", max_length=200)

    disable_overlays: bool = Field(default=False, alias="disableOverlays")
    disable_animations: bool = Field(default=False, alias="disableAnimations")
    blocklisted_transitions: list[str] = Field(
        default_factory=list,
        alias="blocklistedTransitions",
    )
    template_mode: str = Field(default="auto", alias="templateMode")
    blocklisted_templates: list[str] = Field(
        default_factory=list,
        alias="blocklistedTemplates",
    )
    allowed_templates: list[str] = Field(
        default_factory=list,
        alias="allowedTemplates",
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
