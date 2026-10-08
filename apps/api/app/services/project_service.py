import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Brief, EntryPath, Project, ProjectStatus, User
from app.schemas.common import to_iso
from app.schemas.project import (
    BriefResponse,
    CreateProjectRequest,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectResponse,
    UpdateBriefRequest,
)
from app.services.media_keys import is_project_object_key
from app.services.quote_service import QuoteService


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._quote_service = QuoteService(session)

    async def create_project(self, user: User, payload: CreateProjectRequest) -> ProjectDetailResponse:
        project = Project(
            user_id=user.id,
            title=payload.title.strip(),
            status=ProjectStatus.DRAFT,
            entry_path=payload.entry_path,
            format_mode=payload.format_mode,
        )
        brief = Brief(
            project=project,
            prompt_text=payload.prompt_text.strip() if payload.prompt_text else None,
            script_text=payload.script_text.strip() if payload.script_text else None,
            target_duration_sec=payload.target_duration_sec,
            language=payload.language,
            model_id=payload.model_id or "hanuman-v1",
            brand_profile_id=payload.brand_profile_id or "bp-1",
        )
        self.session.add(project)
        self.session.add(brief)
        await self.session.commit()
        return await self.get_project(user, project.id)

    async def list_projects(self, user: User) -> ProjectListResponse:
        stmt = (
            select(Project)
            .where(Project.user_id == user.id)
            .order_by(Project.created_at.desc())
        )
        result = await self.session.execute(stmt)
        projects = result.scalars().all()
        return ProjectListResponse(
            items=[self._to_summary(p) for p in projects],
            total=len(projects),
        )

    async def get_project(self, user: User, project_id: uuid.UUID) -> ProjectDetailResponse:
        project = await self._get_user_project(user, project_id)
        return self._to_detail(project)

    async def update_brief(
        self, user: User, project_id: uuid.UUID, payload: UpdateBriefRequest
    ) -> ProjectDetailResponse:
        project = await self._get_user_project(user, project_id)
        if project.status != ProjectStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Brief can only be updated while project is in draft status",
            )
        if project.brief is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brief not found")

        brief = project.brief
        if payload.script_s3_key is not None:
            if not is_project_object_key(payload.script_s3_key, project.id):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="scriptS3Key must belong to this project",
                )
            brief.script_s3_key = payload.script_s3_key
            project.entry_path = EntryPath.SCRIPT_FIRST
        if payload.target_duration_sec is not None:
            brief.target_duration_sec = payload.target_duration_sec
        if payload.language is not None:
            brief.language = payload.language
        if payload.model_id is not None:
            brief.model_id = payload.model_id
        if payload.brand_profile_id is not None:
            brief.brand_profile_id = payload.brand_profile_id

        await self.session.commit()
        return await self.get_project(user, project_id)

    async def _get_user_project(self, user: User, project_id: uuid.UUID) -> Project:
        stmt = (
            select(Project)
            .options(selectinload(Project.brief), selectinload(Project.quotes))
            .where(Project.id == project_id, Project.user_id == user.id)
        )
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    def _to_summary(self, project: Project) -> ProjectResponse:
        return ProjectResponse(
            id=str(project.id),
            user_id=str(project.user_id),
            title=project.title,
            status=project.status.value,
            entry_path=project.entry_path.value,
            format_mode=project.format_mode.value,
            created_at=to_iso(project.created_at),
            updated_at=to_iso(project.updated_at),
        )

    def _to_detail(self, project: Project) -> ProjectDetailResponse:
        brief_response = None
        if project.brief is not None:
            brief = project.brief
            brief_response = BriefResponse(
                id=str(brief.id),
                project_id=str(brief.project_id),
                prompt_text=brief.prompt_text,
                script_text=brief.script_text,
                script_s3_key=brief.script_s3_key,
                target_duration_sec=brief.target_duration_sec,
                language=brief.language,
                created_at=to_iso(brief.created_at),
            )

        active_quote = next((q for q in project.quotes if q.is_active), None)
        quote_response = (
            self._quote_service._to_response(active_quote, project)
            if active_quote is not None
            else None
        )

        return ProjectDetailResponse(
            **self._to_summary(project).model_dump(),
            brief=brief_response,
            active_quote=quote_response,
        )
