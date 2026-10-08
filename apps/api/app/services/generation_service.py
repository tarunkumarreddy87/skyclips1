import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
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
from app.services.billing_client import apply_generation_credits
from app.services.media_keys import (
    foreign_timeline_srcs,
    is_project_object_key,
    timeline_clip_srcs,
)
from app.schemas.generation import (
    ArtifactResponse,
    BrandCompliancePayload,
    GenerationRunResponse,
    StartGenerationResponse,
    TimelineResponse,
)
from app.services.storage import StorageService
from app.services.production_memory import remember_preferences
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
        # Serialise all starts for a project. The lock is released after the QUEUED
        # run is durable, before any slow external call.
        project = await self._get_project(user, project_id, for_update=True)
        active_run = await self._prepare_project_for_start(project, user)
        if active_run is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A generation run is already in progress",
            )
        previous_project_status = project.status

        if project.status not in (ProjectStatus.APPROVED, ProjectStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project must be approved before generation",
            )

        quote = await self._active_quote(project.id)
        if quote is None or quote.status != QuoteStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No approved quote")
        if project.brief is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No brief")
        if brand_compliance:
            if not any((brand_compliance.commercial_stock, brand_compliance.general_web_crawling, brand_compliance.ai_generated_images)):
                raise HTTPException(422, "Choose at least one media source in channel settings")
            if brand_compliance.ai_generated_images and not brand_compliance.image_model:
                raise HTTPException(422, "Choose an image model in channel settings")
            if brand_compliance.ai_generated_images and not (settings.openrouter_image_api_key.strip() or (settings.openrouter_api_key.strip() if "openrouter.ai" in settings.openrouter_base_url else "")):
                raise HTTPException(503, "AI images need a valid OPENROUTER_IMAGE_API_KEY on the generation server")

        run = GenerationRun(
            project_id=project.id,
            quote_id=quote.id,
            status=GenerationRunStatus.QUEUED,
            started_at=datetime.now(UTC),
        )
        self.session.add(run)
        await self.session.flush()

        workflow_id = f"video-gen-{run.id}"
        project.status = ProjectStatus.QUEUED
        project.workflow_id = workflow_id
        credit_amount = quote.credit_estimate
        billing_user_id = user.external_id
        brief = project.brief
        workflow_input = {
            "project_id": str(project.id),
            "run_id": str(run.id),
            "quote_id": str(quote.id),
            "entry_path": project.entry_path.value,
            "format_mode": project.format_mode.value,
            "voice_id": (brand_compliance.voice_id if brand_compliance else None) or quote.voice_id,
            "language": (brand_compliance.language if brand_compliance else None) or quote.language or brief.language,
            "language_locked": bool(brand_compliance and brand_compliance.language),
            "caption_script": brand_compliance.caption_script if brand_compliance else "latin",
            "ai_generated_images": brand_compliance.ai_generated_images if brand_compliance else False,
            "image_model": brand_compliance.image_model if brand_compliance else None,
            "uploaded_templates": [t.model_dump() for t in brand_compliance.uploaded_templates] if brand_compliance else [],
            "motion_graphics": brand_compliance.motion_graphics.model_dump(by_alias=True)
            if brand_compliance and brand_compliance.motion_graphics else None,
            "commercial_stock": brand_compliance.commercial_stock if brand_compliance else True,
            "cc_public_domain": brand_compliance.cc_public_domain if brand_compliance else False,
            "general_web_crawling": brand_compliance.general_web_crawling if brand_compliance else False,
            "blacklisted_webpages": brand_compliance.blacklisted_webpages if brand_compliance else [],
            "background_color": brand_compliance.background_color if brand_compliance else None,
            "disable_effects": brand_compliance.disable_effects if brand_compliance else False,
            "title": project.title,
            "prompt_text": brief.prompt_text,
            "script_text": brief.script_text,
            "script_s3_key": brief.script_s3_key,
            "target_duration_sec": quote.duration_sec,
            "brand_profile_id": (brand_compliance.theme_id if brand_compliance else None) or quote.brand_profile_id or brief.brand_profile_id or "standard",
            "disable_overlays": bool(brand_compliance.disable_overlays) if brand_compliance else False,
            "disable_animations": bool(brand_compliance.disable_animations) if brand_compliance else False,
            "blocklisted_transitions": list(brand_compliance.blocklisted_transitions)
            if brand_compliance
            else [],
            "template_mode": (
                str(brand_compliance.template_mode or "auto") if brand_compliance else "auto"
            ),
            "blocklisted_templates": list(brand_compliance.blocklisted_templates)
            if brand_compliance
            else [],
            "allowed_templates": list(brand_compliance.allowed_templates)
            if brand_compliance
            else [],
            # Workflows cannot read process settings deterministically. Pass the API's
            # configured media queue as input for the render workflow it may spawn.
            "media_task_queue": settings.temporal_task_queue_media,
            "production_agent_enabled": settings.production_agent_enabled and not settings.hanuman_stub_mode,
            "channel_profile_id": brand_compliance.profile_id if brand_compliance else brief.brand_profile_id,
        }

        try:
            # Durable before billing/Temporal: callbacks can never target a missing run.
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A generation run is already in progress",
            ) from exc

        charged = False
        try:
            if workflow_input["production_agent_enabled"]:
                try:
                    workflow_input["channel_memory"] = await remember_preferences(
                        self.storage, str(user.id), workflow_input["channel_profile_id"] or "default",
                        {key: workflow_input.get(key) for key in ("language", "voice_id", "caption_script", "format_mode", "target_duration_sec", "motion_graphics", "commercial_stock", "ai_generated_images", "image_model", "general_web_crawling")},
                    )
                except Exception as exc:
                    logger.warning("Production memory storage unavailable: %s", type(exc).__name__)
                    raise HTTPException(503, "Channel memory is temporarily unavailable. No generation credits were charged; please retry.") from exc
            charged = await apply_generation_credits(
                user_external_id=billing_user_id,
                run_id=run.id,
                amount=credit_amount,
            )
        except HTTPException as exc:
            await self._mark_start_failed(
                project.id,
                run.id,
                previous_project_status,
                self._error_text(exc),
                clear_credit=False,
            )
            raise

        if charged:
            try:
                await self._record_credit_charge(project.id, run.id, credit_amount)
            except Exception as exc:
                await self.session.rollback()
                refunded = await self._best_effort_refund(
                    user_external_id=billing_user_id,
                    run_id=run.id,
                    amount=credit_amount,
                )
                await self._mark_start_failed(
                    project.id,
                    run.id,
                    previous_project_status,
                    "Credit charge could not be recorded.",
                    clear_credit=refunded,
                    pending_credit_amount=credit_amount if not refunded else 0,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Credit charge could not be recorded; it was rolled back. Please retry.",
                ) from exc

        try:
            temporal_run_id = await self.temporal.start_video_generation(workflow_id, workflow_input)
        except (WorkflowAlreadyStartedError, RPCError) as exc:
            refunded = await self._best_effort_refund(
                user_external_id=billing_user_id,
                run_id=run.id,
                amount=credit_amount if charged else 0,
            )
            await self._mark_start_failed(
                project.id,
                run.id,
                previous_project_status,
                "Temporal rejected the workflow start.",
                clear_credit=refunded,
            )
            logger.warning("Temporal workflow start failed for %s: %s", workflow_id, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Video generation could not start because a workflow is already running "
                    "or Temporal rejected the request. Retry in a moment."
                ),
            ) from exc
        except Exception as exc:
            refunded = await self._best_effort_refund(
                user_external_id=billing_user_id,
                run_id=run.id,
                amount=credit_amount if charged else 0,
            )
            await self._mark_start_failed(
                project.id,
                run.id,
                previous_project_status,
                "Video generation service was unavailable.",
                clear_credit=refunded,
            )
            logger.exception("Temporal unavailable while starting generation for project %s", project_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Video generation service is unavailable. Start infrastructure with "
                    "`make up`, then run `make orchestrator` and `make media`."
                ),
            ) from exc

        try:
            run = await self._mark_workflow_started(project.id, run.id, temporal_run_id)
        except Exception as exc:
            # The QUEUED row was committed before Temporal. Do not refund or start a
            # duplicate: the running workflow can still reconcile it via callbacks.
            await self.session.rollback()
            logger.exception("Workflow %s started but its RUNNING state could not be saved", workflow_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Generation started, but status synchronisation is delayed. Refresh the project shortly.",
            ) from exc

        return StartGenerationResponse(run=self._run_response(run), workflow_id=workflow_id)

    async def start_render(
        self,
        user: User,
        project_id: uuid.UUID,
        timeline_manifest: dict[str, Any] | None = None,
    ) -> StartGenerationResponse:
        project = await self._get_project(user, project_id, for_update=True)
        active_run = await self._prepare_project_for_start(project, user)
        if active_run is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A generation run is already in progress",
            )
        previous_project_status = project.status

        # Allow COMPLETED (first export) or FAILED (retry after render/heartbeat failure)
        # when a timeline artifact already exists — do not force a full regenerate.
        if project.status not in (ProjectStatus.COMPLETED, ProjectStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project must have a generated timeline before rendering",
            )

        quote = await self._active_quote(project.id)
        if quote is None or quote.status != QuoteStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No approved quote")

        existing_timeline_key: str | None = None
        if timeline_manifest is None:
            stmt = (
                select(Artifact)
                .where(Artifact.project_id == project.id, Artifact.type == ArtifactType.TIMELINE)
                .order_by(Artifact.created_at.desc())
                .limit(1)
            )
            artifact = (await self.session.execute(stmt)).scalar_one_or_none()
            if artifact is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Timeline manifest not found. Generate the timeline first.",
                )
            if not is_project_object_key(artifact.s3_key, project.id):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Stored timeline key is outside this project.",
                )
            existing_timeline_key = artifact.s3_key
            try:
                raw = await asyncio.to_thread(self.storage.get_object_bytes, artifact.s3_key)
                timeline_manifest = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Stored timeline is not valid JSON.",
                ) from exc
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Stored timeline could not be loaded. Please retry.",
                ) from exc

        assert timeline_manifest is not None
        self._validate_render_timeline(timeline_manifest, project.id)

        run = GenerationRun(
            project_id=project.id,
            quote_id=quote.id,
            status=GenerationRunStatus.QUEUED,
            started_at=datetime.now(UTC),
        )
        self.session.add(run)
        await self.session.flush()

        workflow_id = f"video-render-{run.id}"
        project.status = ProjectStatus.QUEUED
        project.workflow_id = workflow_id
        timeline_key = existing_timeline_key or f"projects/{project.id}/runs/{run.id}/timeline.v1.json"
        workflow_input = {
            "project_id": str(project.id),
            "run_id": str(run.id),
            "quote_id": str(quote.id),
            "timeline_key": timeline_key,
            "media_task_queue": settings.temporal_task_queue_media,
        }

        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A generation run is already in progress",
            ) from exc

        if existing_timeline_key is None:
            # The run is durable first; an upload/DB failure can now be represented as
            # a failed run rather than rolling the project back invisibly.
            manifest_bytes = json.dumps(timeline_manifest, allow_nan=False).encode("utf-8")
            try:
                await asyncio.to_thread(
                    self.storage.upload_bytes,
                    timeline_key,
                    manifest_bytes,
                    "application/json",
                )
                self.session.add(
                    Artifact(
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
                )
                await self.session.commit()
            except Exception as exc:
                await self.session.rollback()
                await self._mark_start_failed(
                    project.id,
                    run.id,
                    previous_project_status,
                    "Edited timeline could not be stored.",
                    clear_credit=False,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Edited timeline could not be stored. Please retry.",
                ) from exc

        try:
            temporal_run_id = await self.temporal.start_video_render(workflow_id, workflow_input)
        except (WorkflowAlreadyStartedError, RPCError) as exc:
            await self._mark_start_failed(
                project.id,
                run.id,
                previous_project_status,
                "Temporal rejected the render workflow start.",
                clear_credit=False,
            )
            logger.warning("Temporal workflow start failed for %s: %s", workflow_id, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Render could not start. Retry in a moment.",
            ) from exc
        except Exception as exc:
            await self._mark_start_failed(
                project.id,
                run.id,
                previous_project_status,
                "Render service was unavailable.",
                clear_credit=False,
            )
            logger.exception("Temporal unavailable while starting render for project %s", project_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Render service is unavailable. Start `make up`, then run `make orchestrator` and `make media`.",
            ) from exc

        try:
            run = await self._mark_workflow_started(project.id, run.id, temporal_run_id)
        except Exception as exc:
            await self.session.rollback()
            logger.exception("Workflow %s started but its RUNNING state could not be saved", workflow_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Render started, but status synchronisation is delayed. Refresh shortly.",
            ) from exc

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

        raw = await asyncio.to_thread(self.storage.get_object_bytes, artifact.s3_key)
        manifest = json.loads(raw.decode("utf-8"))
        media_urls: dict[str, str] = {}
        for src in timeline_clip_srcs(manifest):
            if src in media_urls:
                continue
            if src.startswith("static:sfx/"):
                media_urls[src] = "/" + src[len("static:"):]
            elif src.startswith(("http://", "https://")):
                media_urls[src] = src
            elif is_project_object_key(src, project.id):
                media_urls[src] = self.storage.public_download_url(src)

        return TimelineResponse(
            artifact_id=str(artifact.id),
            manifest=manifest,
            media_urls=media_urls,
        )

    async def get_final_video(
        self, user: User, project_id: uuid.UUID, *, run_id: uuid.UUID | None = None
    ) -> ArtifactResponse:
        project = await self._get_project(user, project_id)
        stmt = (
            select(Artifact)
            .where(Artifact.project_id == project.id, Artifact.type == ArtifactType.FINAL_VIDEO)
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        if run_id is not None:
            # /video pins its download to the run being displayed. A prior export
            # remains available to existing callers but cannot mask a new failure.
            stmt = stmt.where(Artifact.run_id == run_id)
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
        if not is_project_object_key(artifact_key, project.id):
            # Never mint a URL for a malformed/legacy row pointing at another tenant.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Final video not found")
        artifact_content_type = artifact.content_type
        artifact_meta = dict(artifact.metadata_ or {})
        duration_raw = artifact_meta.get("duration_sec")
        duration_sec = float(duration_raw) if duration_raw is not None else None

        return ArtifactResponse(
            id=artifact_id,
            project_id=artifact_project_id,
            run_id=artifact_run_id,
            type=artifact_type,
            download_url=self.storage.public_download_url(artifact_key),
            content_type=artifact_content_type,
            duration_sec=duration_sec,
            metadata=artifact_meta or None,
        )

    async def _get_project(
        self, user: User, project_id: uuid.UUID, *, for_update: bool = False
    ) -> Project:
        stmt = (
            select(Project)
            .options(selectinload(Project.brief))
            .where(Project.id == project_id, Project.user_id == user.id)
        )
        if for_update:
            stmt = stmt.with_for_update(of=Project)
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _active_quote(self, project_id: uuid.UUID) -> Quote | None:
        stmt = (
            select(Quote)
            .where(Quote.project_id == project_id, Quote.is_active.is_(True))
            .order_by(Quote.version.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalars().first()

    async def _active_run(
        self, project_id: uuid.UUID, *, for_update: bool = False
    ) -> GenerationRun | None:
        stmt = (
            select(GenerationRun)
            .where(
                GenerationRun.project_id == project_id,
                GenerationRun.status.in_(
                    [GenerationRunStatus.QUEUED, GenerationRunStatus.RUNNING]
                ),
            )
            .order_by(GenerationRun.started_at.desc(), GenerationRun.created_at.desc())
            .limit(1)
        )
        if for_update:
            stmt = stmt.with_for_update()
        return (await self.session.execute(stmt)).scalars().first()

    async def _prepare_project_for_start(
        self, project: Project, user: User
    ) -> GenerationRun | None:
        """Reap a stale active run and settle old failed-run refunds under the project lock."""
        active = await self._active_run(project.id, for_update=True)
        if active is not None:
            ref = active.started_at or active.created_at
            if ref is None or datetime.now(UTC) - ref <= STALE_RUN_TTL:
                return active

            logger.warning(
                "Marking stale generation run %s as failed (project %s)",
                active.id,
                project.id,
            )
            active.status = GenerationRunStatus.FAILED
            active.error_message = "Run timed out (no progress). You can retry."
            active.completed_at = datetime.now(UTC)
            project.status = ProjectStatus.FAILED
            await self._refund_locked_run(active, user)
            await self.session.flush()

        # A failed Temporal start whose ledger was temporarily unavailable keeps
        # its amount in Postgres. Settle it before allowing another debit.
        pending_stmt = (
            select(GenerationRun)
            .where(
                GenerationRun.project_id == project.id,
                GenerationRun.status.in_(
                    [GenerationRunStatus.FAILED, GenerationRunStatus.CANCELLED]
                ),
                GenerationRun.credit_charged_amount > 0,
            )
            .order_by(GenerationRun.created_at.asc())
            .with_for_update()
        )
        pending = list((await self.session.execute(pending_stmt)).scalars().all())
        for failed_run in pending:
            await self._refund_locked_run(failed_run, user)
        if pending:
            await self.session.flush()
        return None

    async def _refund_locked_run(self, run: GenerationRun, user: User) -> None:
        amount = run.credit_charged_amount
        if amount <= 0:
            return
        refunded = await apply_generation_credits(
            user_external_id=user.external_id,
            run_id=run.id,
            amount=amount,
            action="refund",
        )
        if not refunded:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="An earlier credit charge is awaiting a refund. Restore billing configuration and retry.",
            )
        run.credit_charged_amount = 0

    async def _record_credit_charge(
        self, project_id: uuid.UUID, run_id: uuid.UUID, amount: int
    ) -> None:
        project, run = await self._lock_project_and_run(project_id, run_id)
        if project is None or run is None or run.status != GenerationRunStatus.QUEUED:
            raise RuntimeError("Queued generation run disappeared before charge was recorded")
        run.credit_charged_amount = amount
        await self.session.commit()

    async def _mark_workflow_started(
        self, project_id: uuid.UUID, run_id: uuid.UUID, temporal_run_id: str
    ) -> GenerationRun:
        project, run = await self._lock_project_and_run(project_id, run_id)
        if project is None or run is None:
            raise RuntimeError("Generation run disappeared after workflow start")
        # A very fast callback may already have completed the run; never regress it.
        if run.status in (GenerationRunStatus.QUEUED, GenerationRunStatus.RUNNING):
            run.temporal_run_id = temporal_run_id
            run.status = GenerationRunStatus.RUNNING
            if project.workflow_id and project.workflow_id.endswith(str(run_id)):
                project.status = ProjectStatus.RUNNING
        await self.session.commit()
        await self.session.refresh(run)
        return run

    async def _mark_start_failed(
        self,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        restore_project_status: ProjectStatus,
        error_message: str,
        *,
        clear_credit: bool,
        pending_credit_amount: int = 0,
    ) -> None:
        await self.session.rollback()
        project, run = await self._lock_project_and_run(project_id, run_id)
        if project is None or run is None:
            return
        if run.status not in (
            GenerationRunStatus.COMPLETED,
            GenerationRunStatus.FAILED,
            GenerationRunStatus.CANCELLED,
        ):
            run.status = GenerationRunStatus.FAILED
            run.error_message = error_message[:2000]
            run.completed_at = datetime.now(UTC)
        if clear_credit:
            run.credit_charged_amount = 0
        elif pending_credit_amount > 0:
            # The debit succeeded but both its DB commit and immediate refund failed.
            # Preserve the amount so _prepare_project_for_start settles it before
            # another generation can be charged.
            run.credit_charged_amount = pending_credit_amount
        if project.workflow_id and project.workflow_id.endswith(str(run_id)):
            project.status = restore_project_status
            project.workflow_id = None
        await self.session.commit()

    async def _lock_project_and_run(
        self, project_id: uuid.UUID, run_id: uuid.UUID
    ) -> tuple[Project | None, GenerationRun | None]:
        project = await self.session.scalar(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        run = await self.session.scalar(
            select(GenerationRun)
            .where(GenerationRun.id == run_id, GenerationRun.project_id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return project, run

    async def _best_effort_refund(
        self, *, user_external_id: str, run_id: uuid.UUID, amount: int
    ) -> bool:
        if amount <= 0:
            return True
        try:
            refunded = await apply_generation_credits(
                user_external_id=user_external_id,
                run_id=run_id,
                amount=amount,
                action="refund",
            )
            if not refunded:
                logger.error("Billing was disabled while refunding charged run %s", run_id)
            return refunded
        except Exception:
            logger.exception("Credit refund is pending for run %s", run_id)
            return False

    def _validate_render_timeline(
        self, timeline_manifest: dict[str, Any], project_id: uuid.UUID
    ) -> None:
        from hanuman_timeline_schema import format_errors, validate_timeline

        errors = validate_timeline(timeline_manifest)
        if errors:
            raise HTTPException(status_code=422, detail=format_errors(errors))
        metadata = timeline_manifest.get("metadata")
        if not isinstance(metadata, dict) or metadata.get("project_id") != str(project_id):
            raise HTTPException(status_code=422, detail="Timeline project does not match this project.")
        if foreign_timeline_srcs(timeline_manifest, project_id):
            raise HTTPException(status_code=422, detail="Timeline references media outside this project.")

    @staticmethod
    def _error_text(exc: HTTPException) -> str:
        return str(exc.detail) if exc.detail else "Generation could not start."

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
