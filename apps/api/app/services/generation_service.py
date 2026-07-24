import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    Artifact,
    ArtifactType,
    GenerationRun,
    GenerationRunStatus,
    Project,
    ProjectStatus,
    Quote,
    QuoteStatus,
    User,
)
from app.schemas.common import to_iso
from app.schemas.generation import (
    ArtifactResponse,
    BrandCompliancePayload,
    GenerationRunResponse,
    StartGenerationResponse,
    TimelineResponse,
)
from app.services.storage import StorageService
from app.services.temporal_service import TemporalService

logger = logging.getLogger(__name__)

# Runs stuck in QUEUED/RUNNING with no completion block new renders (409).
STALE_RUN_TTL = timedelta(minutes=45)


class GenerationService:
    def __init__(self, session: AsyncSession, storage: StorageService) -> None:
        self.session = session
        self.storage = storage
        self.temporal = TemporalService()

    async def start_generation(
        self,
        user: User,
        project_id: uuid.UUID,
        brand_compliance: BrandCompliancePayload | None = None,
    ) -> StartGenerationResponse:
        project = await self._get_project(user, project_id)

        if project.status not in (ProjectStatus.APPROVED, ProjectStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project must be approved before generation",
            )

        active_run = await self._active_run(project.id)
        if active_run is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A generation run is already in progress",
            )

        quote = await self._active_quote(project.id)
        if quote is None or quote.status != QuoteStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No approved quote")

        if project.brief is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No brief")

        run = GenerationRun(
            project_id=project.id,
            quote_id=quote.id,
            status=GenerationRunStatus.QUEUED,
            started_at=datetime.now(UTC),
        )
        project.status = ProjectStatus.QUEUED

        self.session.add(run)
        await self.session.flush()

        workflow_id = f"video-gen-{run.id}"
        brief = project.brief
        workflow_input = {
            "project_id": str(project.id),
            "run_id": str(run.id),
            "quote_id": str(quote.id),
            "entry_path": project.entry_path.value,
            "format_mode": project.format_mode.value,
            "voice_id": quote.voice_id,
            "language": quote.language or brief.language,
            "title": project.title,
            "prompt_text": brief.prompt_text,
            "script_text": brief.script_text,
            "script_s3_key": brief.script_s3_key,
            "target_duration_sec": quote.duration_sec,
            "brand_profile_id": quote.brand_profile_id or brief.brand_profile_id or "standard",
            "disable_overlays": bool(brand_compliance.disable_overlays) if brand_compliance else False,
            "disable_animations": bool(brand_compliance.disable_animations) if brand_compliance else False,
            "blocklisted_transitions": list(brand_compliance.blocklisted_transitions)
            if brand_compliance
            else [],
        }

        try:
            temporal_run_id = await self.temporal.start_video_generation(workflow_id, workflow_input)
        except (WorkflowAlreadyStartedError, RPCError) as exc:
            await self.session.rollback()
            logger.warning("Temporal workflow start failed for %s: %s", workflow_id, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Video generation could not start because a workflow is already running "
                    "or Temporal rejected the request. Retry in a moment."
                ),
            ) from exc
        except Exception as exc:
            await self.session.rollback()
            logger.exception("Temporal unavailable while starting generation for project %s", project_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Video generation service is unavailable. Start infrastructure with "
                    "`make up`, then run `make orchestrator` and `make media`."
                ),
            ) from exc

        run.temporal_run_id = temporal_run_id
        run.status = GenerationRunStatus.RUNNING
        project.status = ProjectStatus.RUNNING
        project.workflow_id = workflow_id

        await self.session.commit()
        await self.session.refresh(run)

        return StartGenerationResponse(
            run=self._run_response(run),
            workflow_id=workflow_id,
        )

    async def start_render(
        self,
        user: User,
        project_id: uuid.UUID,
        timeline_manifest: dict[str, Any] | None = None,
    ) -> StartGenerationResponse:
        project = await self._get_project(user, project_id)

        # Allow COMPLETED (first export) or FAILED (retry after render/heartbeat failure)
        # when a timeline artifact already exists — do not force a full regenerate.
        if project.status not in (ProjectStatus.COMPLETED, ProjectStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project must have a generated timeline before rendering",
            )

        active_run = await self._active_run(project.id)
        if active_run is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A generation run is already in progress",
            )

        quote = await self._active_quote(project.id)
        if quote is None or quote.status != QuoteStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No approved quote")

        # Resolve timeline before creating a run so FAILED projects without a timeline
        # get a clear 404 instead of a queued dead run.
        existing_timeline_key: str | None = None
        if timeline_manifest is None:
            stmt = (
                select(Artifact)
                .where(Artifact.project_id == project.id, Artifact.type == ArtifactType.TIMELINE)
                .order_by(Artifact.created_at.desc())
                .limit(1)
            )
            result = await self.session.execute(stmt)
            artifact = result.scalar_one_or_none()
            if artifact is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Timeline manifest not found. Generate the timeline first.",
                )
            existing_timeline_key = artifact.s3_key

        run = GenerationRun(
            project_id=project.id,
            quote_id=quote.id,
            status=GenerationRunStatus.QUEUED,
            started_at=datetime.now(UTC),
        )
        project.status = ProjectStatus.QUEUED

        self.session.add(run)
        await self.session.flush()

        if timeline_manifest is None:
            timeline_key = existing_timeline_key
            assert timeline_key is not None
        else:
            # Persist the edited timeline so editor reloads reflect changes and renderer uses it.
            manifest_bytes = json.dumps(timeline_manifest).encode("utf-8")
            timeline_key = f"projects/{project.id}/runs/{run.id}/timeline.v1.json"
            self.storage.upload_bytes(timeline_key, manifest_bytes, "application/json")

            artifact = Artifact(
                id=uuid.uuid4(),
                project_id=project.id,
                run_id=run.id,
                type=ArtifactType.TIMELINE,
                s3_bucket=self.storage.bucket,
                s3_key=timeline_key,
                content_type="application/json",
                size_bytes=len(manifest_bytes),
                metadata_={},
            )
            self.session.add(artifact)

        workflow_id = f"video-render-{run.id}"
        workflow_input = {
            "project_id": str(project.id),
            "run_id": str(run.id),
            "quote_id": str(quote.id),
            "timeline_key": timeline_key,
        }

        try:
            temporal_run_id = await self.temporal.start_video_render(workflow_id, workflow_input)
        except (WorkflowAlreadyStartedError, RPCError) as exc:
            await self.session.rollback()
            logger.warning("Temporal workflow start failed for %s: %s", workflow_id, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Render could not start. Retry in a moment.",
            ) from exc
        except Exception as exc:
            await self.session.rollback()
            logger.exception("Temporal unavailable while starting render for project %s", project_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Render service is unavailable. Start `make up`, then run `make orchestrator` and `make media`.",
            ) from exc

        run.temporal_run_id = temporal_run_id
        run.status = GenerationRunStatus.RUNNING
        project.status = ProjectStatus.RUNNING
        project.workflow_id = workflow_id

        await self.session.commit()
        await self.session.refresh(run)

        return StartGenerationResponse(run=self._run_response(run), workflow_id=workflow_id)

    async def get_latest_run(self, user: User, project_id: uuid.UUID) -> GenerationRunResponse | None:
        project = await self._get_project(user, project_id)
        stmt = (
            select(GenerationRun)
            .where(GenerationRun.project_id == project.id)
            .order_by(GenerationRun.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        run = result.scalar_one_or_none()
        return self._run_response(run) if run else None

    async def get_timeline(self, user: User, project_id: uuid.UUID) -> TimelineResponse:
        project = await self._get_project(user, project_id)
        stmt = (
            select(Artifact)
            .where(Artifact.project_id == project.id, Artifact.type == ArtifactType.TIMELINE)
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        artifact = result.scalar_one_or_none()
        if artifact is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timeline manifest not found. Complete generation first.",
            )

        raw = self.storage.get_object_bytes(artifact.s3_key)
        manifest = json.loads(raw.decode("utf-8"))
        media_urls: dict[str, str] = {}
        tracks = manifest.get("tracks", {})
        for clip in [
            *tracks.get("video", []),
            *tracks.get("audio", []),
            *tracks.get("broll", []),
            *tracks.get("music", []),
        ]:
            src = clip.get("src")
            if src and src not in media_urls:
                if isinstance(src, str) and (src.startswith("http://") or src.startswith("https://")):
                    media_urls[src] = src
                else:
                    media_urls[src] = self.storage.presigned_download_url(src)

        return TimelineResponse(
            artifact_id=str(artifact.id),
            manifest=manifest,
            media_urls=media_urls,
        )

    async def get_final_video(self, user: User, project_id: uuid.UUID) -> ArtifactResponse:
        project = await self._get_project(user, project_id)
        stmt = (
            select(Artifact)
            .where(Artifact.project_id == project.id, Artifact.type == ArtifactType.FINAL_VIDEO)
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        artifact = result.scalar_one_or_none()
        if artifact is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Final video not found")

        # Copy scalars before leaving the ORM context (avoids lazy IO / greenlet issues).
        artifact_id = str(artifact.id)
        artifact_project_id = str(artifact.project_id)
        artifact_run_id = str(artifact.run_id) if artifact.run_id else None
        artifact_type = artifact.type.value
        artifact_key = artifact.s3_key
        artifact_content_type = artifact.content_type
        artifact_meta = dict(artifact.metadata_ or {})
        duration_raw = artifact_meta.get("duration_sec")
        duration_sec = float(duration_raw) if duration_raw is not None else None

        return ArtifactResponse(
            id=artifact_id,
            project_id=artifact_project_id,
            run_id=artifact_run_id,
            type=artifact_type,
            download_url=self.storage.presigned_download_url(artifact_key),
            content_type=artifact_content_type,
            duration_sec=duration_sec,
            metadata=artifact_meta or None,
        )

    async def _get_project(self, user: User, project_id: uuid.UUID) -> Project:
        stmt = (
            select(Project)
            .options(selectinload(Project.brief))
            .where(Project.id == project_id, Project.user_id == user.id)
        )
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _active_quote(self, project_id: uuid.UUID) -> Quote | None:
        stmt = select(Quote).where(Quote.project_id == project_id, Quote.is_active.is_(True))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _active_run(self, project_id: uuid.UUID) -> GenerationRun | None:
        stmt = select(GenerationRun).where(
            GenerationRun.project_id == project_id,
            GenerationRun.status.in_([GenerationRunStatus.QUEUED, GenerationRunStatus.RUNNING]),
        )
        result = await self.session.execute(stmt)
        run = result.scalar_one_or_none()
        if run is None:
            return None
        ref = run.started_at or run.created_at
        if ref is not None and datetime.now(UTC) - ref > STALE_RUN_TTL:
            logger.warning(
                "Marking stale generation run %s as failed (project %s)",
                run.id,
                project_id,
            )
            run.status = GenerationRunStatus.FAILED
            run.error_message = "Run timed out (no progress). You can retry render."
            run.completed_at = datetime.now(UTC)
            await self.session.commit()
            return None
        return run

    def _run_response(self, run: GenerationRun) -> GenerationRunResponse:
        return GenerationRunResponse(
            id=str(run.id),
            project_id=str(run.project_id),
            quote_id=str(run.quote_id),
            status=run.status.value,
            current_stage=run.current_stage,
            temporal_run_id=run.temporal_run_id,
            error_message=run.error_message,
            started_at=to_iso(run.started_at) if run.started_at else None,
            completed_at=to_iso(run.completed_at) if run.completed_at else None,
        )
