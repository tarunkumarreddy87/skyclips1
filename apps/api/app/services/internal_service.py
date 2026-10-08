import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import (
    Artifact,
    ArtifactType,
    GenerationRun,
    GenerationRunStatus,
    Project,
    ProjectStatus,
    User,
)
from app.schemas.generation import (
    InternalArtifactRequest,
    InternalProgressEventRequest,
    InternalRunStatusRequest,
)
from app.services.billing_client import apply_generation_credits
from app.services.media_keys import is_project_object_key
from app.services.progress_service import ProgressService

logger = logging.getLogger(__name__)

TERMINAL_RUN_STATUSES = frozenset(
    {GenerationRunStatus.COMPLETED, GenerationRunStatus.FAILED, GenerationRunStatus.CANCELLED}
)
# Outcomes that return the user's credits.
REFUNDABLE_RUN_STATUSES = frozenset({GenerationRunStatus.FAILED, GenerationRunStatus.CANCELLED})
# The API itself owns draft/quoted/approved/queued/running; callbacks only report outcomes.
CALLBACK_PROJECT_STATUSES = frozenset({ProjectStatus.COMPLETED, ProjectStatus.FAILED})


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class InternalService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.progress = ProgressService(session)

    async def record_progress(self, payload: InternalProgressEventRequest):
        return await self.progress.ingest_event(payload)

    async def register_artifact(self, payload: InternalArtifactRequest) -> str:
        try:
            project_id = uuid.UUID(payload.project_id)
            run_id = uuid.UUID(payload.run_id)
            artifact_type = ArtifactType(payload.type)
        except ValueError as exc:
            raise _unprocessable("Invalid artifact (projectId, runId or type).") from exc

        run_project_id = await self.session.scalar(
            select(GenerationRun.project_id).where(GenerationRun.id == run_id)
        )
        if run_project_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
        if run_project_id != project_id:
            raise _unprocessable("Run does not belong to this project.")
        if not is_project_object_key(payload.s3_key, project_id):
            raise _unprocessable("Artifact key must be inside the project's folder.")

        artifact = Artifact(
            id=uuid.uuid4(),
            project_id=project_id,
            run_id=run_id,
            type=artifact_type,
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
        # Validate everything before any side effect (a refund must never precede a 422).
        try:
            new_status = GenerationRunStatus(payload.status)
            project_status = ProjectStatus(payload.project_status) if payload.project_status else None
        except ValueError as exc:
            raise _unprocessable("Invalid run or project status.") from exc
        if new_status == GenerationRunStatus.QUEUED:
            raise _unprocessable("Runs cannot be moved back to queued.")
        if project_status is not None and project_status not in CALLBACK_PROJECT_STATUSES:
            raise _unprocessable("Callbacks may only mark a project completed or failed.")

        expected_project_status = {
            GenerationRunStatus.COMPLETED: ProjectStatus.COMPLETED,
            GenerationRunStatus.FAILED: ProjectStatus.FAILED,
            GenerationRunStatus.CANCELLED: ProjectStatus.FAILED,
        }.get(new_status)
        if project_status is not None and project_status != expected_project_status:
            raise _unprocessable("Project status does not match the run outcome.")

        project_id = await self.session.scalar(
            select(GenerationRun.project_id).where(GenerationRun.id == run_id)
        )
        if project_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
        # Lock order is project -> run everywhere (GenerationService too), so duplicate
        # callbacks and user-initiated starts serialise without deadlocking.
        project = await self._locked(Project, project_id)
        run = await self._locked(GenerationRun, run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

        if run.status in TERMINAL_RUN_STATUSES:
            # Late or retried callback: the first terminal outcome wins. Acknowledge
            # (200) so the worker stops retrying, but never regress state or re-refund.
            logger.info(
                "Ignoring %s callback for run %s already %s",
                new_status.value,
                run_id,
                run.status.value,
            )
            await self.session.commit()
            return

        if new_status in REFUNDABLE_RUN_STATUSES and run.credit_charged_amount > 0:
            owner = await self.session.get(User, project.user_id) if project is not None else None
            if owner is not None:
                # Refund before commit: if the commit then fails, the retried callback
                # refunds again and the ledger's per-run idempotency key dedupes it.
                refunded = await apply_generation_credits(
                    user_external_id=owner.external_id,
                    run_id=run.id,
                    amount=run.credit_charged_amount,
                    action="refund",
                )
                if not refunded:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Credit refund is awaiting billing configuration.",
                    )
                run.credit_charged_amount = 0

        run.status = new_status
        run.current_stage = payload.current_stage
        run.error_message = payload.error_message

        if new_status == GenerationRunStatus.COMPLETED:
            run.completed_at = datetime.now(UTC)
        if (
            new_status in (GenerationRunStatus.COMPLETED, GenerationRunStatus.FAILED)
            and project is not None
            and project_status is not None
        ):
            project.status = project_status

        await self.session.commit()

    async def _locked(self, model, row_id: uuid.UUID):
        """SELECT ... FOR NO KEY UPDATE, refreshing any stale identity-map copy."""
        return await self.session.scalar(
            select(model)
            .where(model.id == row_id)
            .with_for_update(key_share=True)
            .execution_options(populate_existing=True)
        )
