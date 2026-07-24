import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import GenerationRun, ProgressEvent, ProgressStageStatus, User
from app.schemas.common import to_iso
from app.schemas.generation import InternalProgressEventRequest, ProgressEventResponse


class ProgressService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def ingest_event(self, payload: InternalProgressEventRequest) -> ProgressEventResponse:
        event = ProgressEvent(
            id=uuid.uuid4(),
            run_id=uuid.UUID(payload.run_id),
            stage=payload.stage,
            status=ProgressStageStatus(payload.status),
            percent=payload.percent,
            message=payload.message,
            artifact_id=uuid.UUID(payload.artifact_id) if payload.artifact_id else None,
        )
        self.session.add(event)

        run = await self.session.get(GenerationRun, uuid.UUID(payload.run_id))
        if run:
            run.current_stage = payload.stage

        await self.session.commit()
        return self._to_response(event, payload.project_id)

    async def list_events(
        self, user: User, project_id: uuid.UUID, run_id: uuid.UUID | None = None
    ) -> list[ProgressEventResponse]:
        await self._verify_project_access(user, project_id)

        if run_id is None:
            run_id = await self._latest_run_id(project_id)

        if run_id is None:
            return []

        stmt = (
            select(ProgressEvent)
            .where(ProgressEvent.run_id == run_id)
            .order_by(ProgressEvent.created_at.asc())
        )
        result = await self.session.execute(stmt)
        events = result.scalars().all()
        return [self._to_response(e, str(project_id)) for e in events]

    async def stream_events(
        self, user: User, project_id: uuid.UUID
    ) -> AsyncGenerator[str, None]:
        seen: set[str] = set()
        # No idle cap — keep the stream alive as long as the client is connected.
        # The previous 120-tick cap closed the stream after 2 min of no new events,
        # which broke live updates for long-running pipelines. EventSource will
        # auto-reconnect if the connection drops, and the terminal-state check below
        # cleanly closes the stream when the run finishes.
        while True:
            events = await self.list_events(user, project_id)
            for event in events:
                if event.id not in seen:
                    seen.add(event.id)
                    yield f"event: progress\ndata: {json.dumps(event.model_dump(by_alias=True))}\n\n"

            run = await self._latest_run(user, project_id)
            if run and run.status in ("completed", "failed", "cancelled"):
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

    async def _latest_run_id(self, project_id: uuid.UUID) -> uuid.UUID | None:
        stmt = (
            select(GenerationRun.id)
            .where(GenerationRun.project_id == project_id)
            .order_by(GenerationRun.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _latest_run(self, user: User, project_id: uuid.UUID) -> GenerationRun | None:
        await self._verify_project_access(user, project_id)
        run_id = await self._latest_run_id(project_id)
        if run_id is None:
            return None
        return await self.session.get(GenerationRun, run_id)

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
