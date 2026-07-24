import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import FormatMode, QuoteStatus


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    format_mode: Mapped[FormatMode] = mapped_column(
        Enum(FormatMode, name="quote_format_mode", native_enum=False), nullable=False
    )
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    voice_id: Mapped[str] = mapped_column(String(128), nullable=False)
    section_outline: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    credit_estimate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resolution: Mapped[str] = mapped_column(String(32), nullable=False, default="1920x1080")
    aspect_ratio: Mapped[str] = mapped_column(String(16), nullable=False, default="16:9")
    model_id: Mapped[str] = mapped_column(String(64), nullable=False, default="hanuman-v1")
    brand_profile_id: Mapped[str] = mapped_column(String(64), nullable=False, default="bp-1")
    status: Mapped[QuoteStatus] = mapped_column(
        Enum(QuoteStatus, name="quote_status", native_enum=False),
        nullable=False,
        default=QuoteStatus.DRAFT,
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="quotes")
    generation_runs: Mapped[list["GenerationRun"]] = relationship(back_populates="quote")
