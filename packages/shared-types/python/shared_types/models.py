from enum import StrEnum
from typing import Optional

from pydantic import BaseModel, Field


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    QUOTED = "quoted"
    APPROVED = "approved"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EntryPath(StrEnum):
    PROMPT_FIRST = "prompt_first"
    SCRIPT_FIRST = "script_first"


class FormatMode(StrEnum):
    DOCUMENTARY = "documentary"
    LISTICLE = "listicle"


class Project(BaseModel):
    id: str
    user_id: str = Field(alias="userId")
    title: str
    status: ProjectStatus
    entry_path: EntryPath = Field(alias="entryPath")
    format_mode: FormatMode = Field(alias="formatMode")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class QuoteStatus(StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SUPERSEDED = "superseded"


class QuoteSectionOutline(BaseModel):
    title: str
    summary: str


class Quote(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    version: int
    is_active: bool = Field(alias="isActive")
    format_mode: FormatMode = Field(alias="formatMode")
    duration_sec: int = Field(alias="durationSec")
    language: str
    voice_id: str = Field(alias="voiceId")
    model_id: str = Field(alias="modelId")
    brand_profile_id: str = Field(alias="brandProfileId")
    section_outline: list[QuoteSectionOutline] = Field(alias="sectionOutline")
    credit_estimate: int = Field(alias="creditEstimate")
    resolution: str
    aspect_ratio: str = Field(alias="aspectRatio")
    status: QuoteStatus
    approved_at: Optional[str] = Field(default=None, alias="approvedAt")
    created_at: str = Field(alias="createdAt")
    warnings: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class ProgressStageStatus(StrEnum):
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"


class ProgressEvent(BaseModel):
    id: str
    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    stage: str
    status: ProgressStageStatus
    percent: Optional[int] = None
    message: str
    artifact_id: Optional[str] = Field(default=None, alias="artifactId")
    artifact_type: Optional[str] = Field(default=None, alias="artifactType")
    timestamp: str

    model_config = {"populate_by_name": True}
