import uuid

from pydantic import Field

from app.schemas.common import ApiModel


class QuoteSectionOutline(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=500)


class QuoteResponse(ApiModel):
    id: str
    project_id: str = Field(serialization_alias="projectId")
    version: int
    is_active: bool = Field(serialization_alias="isActive")
    format_mode: str = Field(serialization_alias="formatMode")
    duration_sec: int = Field(serialization_alias="durationSec")
    language: str
    voice_id: str = Field(serialization_alias="voiceId")
    section_outline: list[QuoteSectionOutline] = Field(serialization_alias="sectionOutline")
    credit_estimate: int = Field(serialization_alias="creditEstimate")
    resolution: str
    aspect_ratio: str = Field(serialization_alias="aspectRatio")
    model_id: str = Field(serialization_alias="modelId")
    brand_profile_id: str = Field(serialization_alias="brandProfileId")
    status: str
    approved_at: str | None = Field(default=None, serialization_alias="approvedAt")
    created_at: str = Field(serialization_alias="createdAt")
    warnings: list[str] = Field(default_factory=list)


class ApproveQuoteRequest(ApiModel):
    quote_id: uuid.UUID = Field(alias="quoteId")


class UpdateQuoteRequest(ApiModel):
    format_mode: str | None = Field(default=None, alias="formatMode")
    duration_sec: int | None = Field(default=None, alias="durationSec", ge=30, le=3600)
    language: str | None = Field(default=None, min_length=2, max_length=16)
    voice_id: str | None = Field(default=None, alias="voiceId", min_length=1, max_length=128)
    model_id: str | None = Field(default=None, alias="modelId", min_length=1, max_length=64)
    brand_profile_id: str | None = Field(default=None, alias="brandProfileId", min_length=1, max_length=64)
    section_outline: list[QuoteSectionOutline] | None = Field(default=None, alias="sectionOutline")
