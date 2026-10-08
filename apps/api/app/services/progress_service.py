import asyncio
import json
import uuid
from collections.abc import AsyncGenerator

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    GenerationRun,
    GenerationRunStatus,
    ProgressEvent,
    ProgressStageStatus,
    User,
)
from app.schemas.common import to_iso
from app.schemas.generation import InternalProgressEventRequest, ProgressEventResponse

_TERMINAL_RUN_STATUSES = frozenset(
    {GenerationRunStatus.COMPLETED, GenerationRunStatus.FAILED, GenerationRunStatus.CANCELLED}
)
# Workers flip the run to terminal just before emitting their final event, so keep
# polling for a couple of ticks after that to deliver the trailing event.
_TRAILING_TERMINAL_TICKS = 3
# progress_events.message is VARCHAR(500); worker errors (FFmpeg stderr) can be longer.
_MAX_MESSAGE_CHARS = 500


class ProgressService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def ingest_event(self, payload: InternalProgressEventRequest) -> ProgressEventResponse:
        try:
            run_id = uuid.UUID(payload.run_id)
            stage_status = ProgressStageStatus(payload.status)
            artifact_id = uuid.UUID(payload.artifact_id) if payload.artifact_id else None
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid progress event (runId, status or artifactId).",
            ) from exc

        run = await self.session.get(GenerationRun, run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

        event = ProgressEvent(
            id=uuid.uuid4(),
            run_id=run_id,
            stage=payload.stage,
            status=stage_status,
            percent=payload.percent,
            message=(payload.message or "")[:_MAX_MESSAGE_CHARS],
            artifact_id=artifact_id,
        )
        self.session.add(event)
        run.current_stage = payload.stage

        await self.session.commit()
        return self._to_response(event, str(run.project_id))

    async def list_events(
        self, user: User, project_id: uuid.UUID, run_id: uuid.UUID | None = None
    ) -> list[ProgressEventResponse]:
        await self._verify_project_access(user, project_id)

        if run_id is None:
            run_id = await self._latest_run_id(project_id)
        elif not await self._run_in_project(run_id, project_id):
            # Never return another project's events for a caller-chosen runId.
            return []

        if run_id is None:
            return []
        return await self._events_for_run(run_id, project_id)

    async def verify_project_access(self, user: User, project_id: uuid.UUID) -> None:
        """Raise 404 unless the project belongs to the caller (use before streaming)."""
        await self._verify_project_access(user, project_id)

    async def stream_events(
        self, user: User, project_id: uuid.UUID
    ) -> AsyncGenerator[str, None]:
        # The route authorises before the response starts (a 404 cannot be sent
        # mid-stream); this repeat check only guards other callers.
        await self._verify_project_access(user, project_id)
        bind = self.session.bind
        # Release the request session: the stream lives as long as the pipeline, and
        # one pooled connection idle in a transaction per open tab exhausts the pool.
        # Each tick uses its own short session, which also guarantees a fresh run
        # status instead of a stale identity-map object.
        await self.session.close()

        seen: set[str] = set()
        terminal_ticks = 0
        # No idle cap: live updates must survive long pipelines. Starlette cancels this
        # generator when the client disconnects.
        while True:
            async with AsyncSession(bind=bind, expire_on_commit=False) as session:
                tick = ProgressService(session)
                run_id = await tick._latest_run_id(project_id)
                run_status = None
                events: list[ProgressEventResponse] = []
                if run_id is not None:
                    run_status = await session.scalar(
                        select(GenerationRun.status).where(GenerationRun.id == run_id)
                    )
                    events = await tick._events_for_run(run_id, project_id)

            for event in events:
                if event.id not in seen:
                    seen.add(event.id)
                    yield f"event: progress\ndata: {json.dumps(event.model_dump(by_alias=True))}\n\n"

            if run_status in _TERMINAL_RUN_STATUSES:
                terminal_ticks += 1
                if terminal_ticks >= _TRAILING_TERMINAL_TICKS:
                    yield ": done\n\n"
                    break

            yield ": heartbeat\n\n"
            await asyncio.sleep(1)

    async def _verify_project_access(self, user: User, project_id: uuid.UUID) -> None:
        from app.db.models import Project

        stmt = select(Project.id).where(Project.id == project_id, Project.user_id == user.id)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    async def _run_in_project(self, run_id: uuid.UUID, project_id: uuid.UUID) -> bool:
        found = await self.session.scalar(
            select(GenerationRun.id).where(
                GenerationRun.id == run_id, GenerationRun.project_id == project_id
            )
        )
        return found is not None

    async def _latest_run_id(self, project_id: uuid.UUID) -> uuid.UUID | None:
        stmt = (
            select(GenerationRun.id)
            .where(GenerationRun.project_id == project_id)
            .order_by(GenerationRun.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _events_for_run(
        self, run_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[ProgressEventResponse]:
        stmt = (
            select(ProgressEvent)
            .where(ProgressEvent.run_id == run_id)
            .order_by(ProgressEvent.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return [self._to_response(e, str(project_id)) for e in result.scalars().all()]

    def _to_response(self, event: ProgressEvent, project_id: str) -> ProgressEventResponse:
        artifact_type = None
        return ProgressEventResponse(
            id=str(event.id),
            run_id=str(event.run_id),
            project_id=project_id,
            stage=event.stage,
            status=event.status.value,
            percent=event.percent,
            message=event.message,
            artifact_id=str(event.artifact_id) if event.artifact_id else None,
            artifact_type=artifact_type,
            timestamp=to_iso(event.created_at),
        )
