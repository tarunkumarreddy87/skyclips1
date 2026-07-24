import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import EntryPath, FormatMode, ProjectStatus


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status", native_enum=False),
        nullable=False,
        default=ProjectStatus.DRAFT,
    )
    entry_path: Mapped[EntryPath] = mapped_column(
        Enum(EntryPath, name="entry_path", native_enum=False), nullable=False
    )
    format_mode: Mapped[FormatMode] = mapped_column(
        Enum(FormatMode, name="format_mode", native_enum=False), nullable=False
    )
    workflow_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="projects")
    brief: Mapped["Brief | None"] = relationship(back_populates="project", uselist=False)
    quotes: Mapped[list["Quote"]] = relationship(back_populates="project")
    generation_runs: Mapped[list["GenerationRun"]] = relationship(back_populates="project")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="project")
    timeline_snapshots: Mapped[list["TimelineSnapshot"]] = relationship(back_populates="project")
