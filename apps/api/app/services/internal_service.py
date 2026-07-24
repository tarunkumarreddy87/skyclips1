import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import (
    Artifact,
    ArtifactType,
    GenerationRun,
    GenerationRunStatus,
    Project,
    ProjectStatus,
)
from app.schemas.generation import (
    InternalArtifactRequest,
    InternalProgressEventRequest,
    InternalRunStatusRequest,
)
from app.services.progress_service import ProgressService


class InternalService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.progress = ProgressService(session)

    async def record_progress(self, payload: InternalProgressEventRequest):
        return await self.progress.ingest_event(payload)

    async def register_artifact(self, payload: InternalArtifactRequest) -> str:
        artifact = Artifact(
            id=uuid.uuid4(),
            project_id=uuid.UUID(payload.project_id),
            run_id=uuid.UUID(payload.run_id),
            type=ArtifactType(payload.type),
            s3_bucket=settings.s3_bucket,
            s3_key=payload.s3_key,
            content_type=payload.content_type,
            size_bytes=payload.size_bytes,
            metadata_=payload.metadata or {},
        )
        self.session.add(artifact)
        await self.session.commit()
        return str(artifact.id)

    async def update_run_status(self, run_id: uuid.UUID, payload: InternalRunStatusRequest) -> None:
        run = await self.session.get(GenerationRun, run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

        run.status = GenerationRunStatus(payload.status)
        run.current_stage = payload.current_stage
        run.error_message = payload.error_message

        if payload.status == GenerationRunStatus.COMPLETED.value:
            run.completed_at = datetime.now(UTC)
        if payload.status in (GenerationRunStatus.COMPLETED.value, GenerationRunStatus.FAILED.value):
            project = await self.session.get(Project, run.project_id)
            if project and payload.project_status:
                project.status = ProjectStatus(payload.project_status)

        await self.session.commit()
