import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import FormatMode, Project, ProjectStatus, Quote, QuoteStatus, User
from app.schemas.common import to_iso
from app.schemas.quote import QuoteResponse, QuoteSectionOutline, UpdateQuoteRequest
from app.services.quote_inference import (
    _content_density_warning,
    _credit_estimate,
    infer_quote,
)


class QuoteService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def generate_quote(self, user: User, project_id: uuid.UUID) -> QuoteResponse:
        project = await self._get_project_for_quote(user, project_id, for_update=True)

        if project.status not in (ProjectStatus.DRAFT, ProjectStatus.QUOTED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot generate quote when project status is '{project.status.value}'",
            )

        if project.brief is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Project has no brief",
            )

        await self._supersede_active_quotes(project.id)

        inferred = infer_quote(project, project.brief)
        next_version = await self._next_quote_version(project.id)

        # Keep brief aligned with inferred prompt hints (e.g. "30mins" / "telugu").
        project.brief.language = inferred.language
        project.brief.target_duration_sec = inferred.duration_sec
        project.brief.brand_profile_id = inferred.brand_profile_id

        quote = Quote(
            project_id=project.id,
            version=next_version,
            is_active=True,
            format_mode=inferred.format_mode,
            duration_sec=inferred.duration_sec,
            language=inferred.language,
            voice_id=inferred.voice_id,
            model_id=inferred.model_id,
            brand_profile_id=inferred.brand_profile_id,
            section_outline=inferred.section_outline,
            credit_estimate=inferred.credit_estimate,
            resolution=inferred.resolution,
            aspect_ratio=inferred.aspect_ratio,
            status=QuoteStatus.PENDING_APPROVAL,
        )
        project.status = ProjectStatus.QUOTED

        self.session.add(quote)
        await self.session.commit()
        await self.session.refresh(quote)
        return self._to_response(quote, project, warnings=inferred.warnings)

    async def update_active_quote(
        self, user: User, project_id: uuid.UUID, payload: UpdateQuoteRequest
    ) -> QuoteResponse:
        project = await self._get_project_for_quote(user, project_id, for_update=True)

        if project.status != ProjectStatus.QUOTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Quote can only be edited while project is quoted",
            )

        quote = await self._get_active_quote(project_id)
        if quote.status != QuoteStatus.PENDING_APPROVAL:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only pending quotes can be edited",
            )

        # An edit creates a new immutable quote revision. Approval carries the id
        # the user reviewed, so an update racing approval can never change the
        # amount/language after consent.
        format_mode = FormatMode(payload.format_mode) if payload.format_mode is not None else quote.format_mode
        duration_sec = payload.duration_sec if payload.duration_sec is not None else quote.duration_sec
        language = payload.language if payload.language is not None else quote.language
        voice_id = payload.voice_id if payload.voice_id is not None else quote.voice_id
        model_id = payload.model_id if payload.model_id is not None else quote.model_id
        brand_profile_id = (
            payload.brand_profile_id
            if payload.brand_profile_id is not None
            else quote.brand_profile_id
        )
        section_outline = (
            [section.model_dump() for section in payload.section_outline]
            if payload.section_outline is not None
            else list(quote.section_outline or [])
        )

        project.format_mode = format_mode
        if project.brief is not None:
            project.brief.target_duration_sec = duration_sec
            project.brief.language = language
            project.brief.model_id = model_id
            project.brief.brand_profile_id = brand_profile_id

        next_version = await self._next_quote_version(project.id)
        await self._supersede_active_quotes(project.id)
        revised = Quote(
            project_id=project.id,
            version=next_version,
            is_active=True,
            format_mode=format_mode,
            duration_sec=duration_sec,
            language=language,
            voice_id=voice_id,
            model_id=model_id,
            brand_profile_id=brand_profile_id,
            section_outline=section_outline,
            credit_estimate=_credit_estimate(duration_sec),
            resolution=quote.resolution,
            aspect_ratio=quote.aspect_ratio,
            status=QuoteStatus.PENDING_APPROVAL,
        )
        self.session.add(revised)
        await self.session.commit()
        await self.session.refresh(revised)
        return self._to_response(revised, project)

    async def approve_quote(
        self,
        user: User,
        project_id: uuid.UUID,
        *,
        expected_quote_id: uuid.UUID | None,
    ) -> QuoteResponse:
        project = await self._get_project_for_quote(user, project_id, for_update=True)

        if project.status != ProjectStatus.QUOTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project must be in quoted status to approve",
            )

        quote = await self._get_active_quote(project_id)
        if expected_quote_id is None or quote.id != expected_quote_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Quote changed since it was reviewed. Review the latest quote before approving.",
            )
        if quote.status != QuoteStatus.PENDING_APPROVAL:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Active quote is not pending approval",
            )

        now = datetime.now(UTC)
        quote.status = QuoteStatus.APPROVED
        quote.approved_at = now
        project.status = ProjectStatus.APPROVED

        await self.session.commit()
        await self.session.refresh(quote)
        return self._to_response(quote, project)

    async def get_active_quote(self, user: User, project_id: uuid.UUID) -> QuoteResponse:
        project = await self._get_project_for_quote(user, project_id)
        quote = await self._get_active_quote(project_id)
        return self._to_response(quote, project)

    async def _get_project_for_quote(
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

    async def _get_active_quote(self, project_id: uuid.UUID) -> Quote:
        stmt = (
            select(Quote)
            .where(Quote.project_id == project_id, Quote.is_active.is_(True))
            .order_by(Quote.version.desc())
            .limit(1)
        )
        quote = (await self.session.execute(stmt)).scalars().first()
        if quote is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active quote found")
        return quote

    async def _supersede_active_quotes(self, project_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Quote)
            .where(Quote.project_id == project_id, Quote.is_active.is_(True))
            .values(is_active=False, status=QuoteStatus.SUPERSEDED)
        )

    async def _next_quote_version(self, project_id: uuid.UUID) -> int:
        stmt = select(Quote.version).where(Quote.project_id == project_id).order_by(Quote.version.desc()).limit(1)
        result = await self.session.execute(stmt)
        current = result.scalar_one_or_none()
        return (current or 0) + 1

    def _quote_warnings(self, quote: Quote, project: Project | None) -> list[str]:
        if project is None or project.brief is None:
            return []
        warning = _content_density_warning(quote.duration_sec, project.brief, quote.section_outline)
        return [warning] if warning else []

    def _normalize_outline_item(self, item: dict) -> QuoteSectionOutline:
        """Accept legacy/recovered outlines that only stored id/title."""
        title_raw = item.get("title") or item.get("id") or "Section"
        title = str(title_raw).strip()[:200] or "Section"
        summary_raw = item.get("summary") or item.get("narration") or title
        summary = str(summary_raw).strip()
        if not summary:
            summary = title
        if len(summary) > 500:
            summary = summary[:497] + "..."
        return QuoteSectionOutline(title=title, summary=summary)

    def _to_response(
        self,
        quote: Quote,
        project: Project | None = None,
        *,
        warnings: list[str] | None = None,
    ) -> QuoteResponse:
        outline = [self._normalize_outline_item(item) for item in quote.section_outline]
        return QuoteResponse(
            id=str(quote.id),
            project_id=str(quote.project_id),
            version=quote.version,
            is_active=quote.is_active,
            format_mode=quote.format_mode.value,
            duration_sec=quote.duration_sec,
            language=quote.language,
            voice_id=quote.voice_id,
            model_id=quote.model_id,
            brand_profile_id=quote.brand_profile_id,
            section_outline=outline,
            credit_estimate=quote.credit_estimate,
            resolution=quote.resolution,
            aspect_ratio=quote.aspect_ratio,
            status=quote.status.value,
            approved_at=to_iso(quote.approved_at) if quote.approved_at else None,
            created_at=to_iso(quote.created_at),
            warnings=warnings if warnings is not None else self._quote_warnings(quote, project),
        )
