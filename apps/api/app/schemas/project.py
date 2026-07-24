from pydantic import Field, model_validator

from app.db.models.enums import EntryPath, FormatMode
from app.schemas.common import ApiModel


class CreateProjectRequest(ApiModel):
    title: str = Field(min_length=1, max_length=500)
    entry_path: EntryPath = Field(alias="entryPath")
    format_mode: FormatMode = Field(alias="formatMode")
    prompt_text: str | None = Field(default=None, alias="promptText")
    script_text: str | None = Field(default=None, alias="scriptText")
    target_duration_sec: int | None = Field(default=None, alias="targetDurationSec", ge=30, le=3600)
    language: str = Field(default="en", min_length=2, max_length=16)
    model_id: str | None = Field(default=None, alias="modelId", min_length=1, max_length=64)
    brand_profile_id: str | None = Field(default=None, alias="brandProfileId", min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_entry_content(self) -> "CreateProjectRequest":
        if self.entry_path == EntryPath.PROMPT_FIRST:
            if not self.prompt_text or not self.prompt_text.strip():
                raise ValueError("promptText is required for prompt_first projects")
        elif self.entry_path == EntryPath.SCRIPT_FIRST:
            if not self.script_text or not self.script_text.strip():
                raise ValueError("scriptText is required for script_first projects")
        return self


class BriefResponse(ApiModel):
    id: str
    project_id: str = Field(serialization_alias="projectId")
    prompt_text: str | None = Field(default=None, serialization_alias="promptText")
    script_text: str | None = Field(default=None, serialization_alias="scriptText")
    script_s3_key: str | None = Field(default=None, serialization_alias="scriptS3Key")
    target_duration_sec: int | None = Field(default=None, serialization_alias="targetDurationSec")
    language: str
    created_at: str = Field(serialization_alias="createdAt")


class ProjectResponse(ApiModel):
    id: str
    user_id: str = Field(serialization_alias="userId")
    title: str
    status: str
    entry_path: str = Field(serialization_alias="entryPath")
    format_mode: str = Field(serialization_alias="formatMode")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class ProjectDetailResponse(ProjectResponse):
    brief: BriefResponse | None = None
    active_quote: "QuoteResponse | None" = Field(default=None, serialization_alias="activeQuote")


# Resolve forward ref for OpenAPI
from app.schemas.quote import QuoteResponse  # noqa: E402

ProjectDetailResponse.model_rebuild()


class ProjectListResponse(ApiModel):
    items: list[ProjectResponse]
    total: int


class UploadUrlRequest(ApiModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(alias="contentType", min_length=1, max_length=128)


class UploadUrlResponse(ApiModel):
    upload_url: str = Field(serialization_alias="uploadUrl")
    s3_key: str = Field(serialization_alias="s3Key")
    expires_in_sec: int = Field(serialization_alias="expiresInSec")
    download_url: str | None = Field(default=None, serialization_alias="downloadUrl")


class UpdateBriefRequest(ApiModel):
    script_s3_key: str | None = Field(default=None, alias="scriptS3Key", min_length=1, max_length=1024)
    target_duration_sec: int | None = Field(default=None, alias="targetDurationSec", ge=30, le=3600)
    language: str | None = Field(default=None, min_length=2, max_length=16)
    model_id: str | None = Field(default=None, alias="modelId", min_length=1, max_length=64)
    brand_profile_id: str | None = Field(default=None, alias="brandProfileId", min_length=1, max_length=64)
