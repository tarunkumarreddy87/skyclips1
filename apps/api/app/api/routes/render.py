import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_render_service
from app.db.models import GenerationRun, Project, User
from app.schemas.render import (
    RenderJobResponse,
    RenderResultResponse,
    RenderStatusResponse,
    StartRenderRequest,
    StartRenderResponse,
)
from app.services.media_keys import foreign_timeline_srcs, is_project_object_key
from app.services.render_service import RenderServiceClient, RenderServiceError

router = APIRouter(prefix="/render", tags=["render"])


def _parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


async def _owns_project(session: AsyncSession, user: User, project_id: str) -> uuid.UUID | None:
    """Project id when it exists and belongs to the caller; None otherwise."""
    pid = _parse_uuid(project_id)
    if pid is None:
        return None
    owned = await session.scalar(
        select(Project.id).where(Project.id == pid, Project.user_id == user.id)
    )
    return pid if owned is not None else None


async def _owned_job(
    render_svc: RenderServiceClient, session: AsyncSession, user: User, render_id: uuid.UUID
) -> RenderJobResponse:
    """Fetch a render job and hide it (404) unless its project belongs to the caller."""
    job = await render_svc.get_status(str(render_id))
    if await _owns_project(session, user, job.project_id) is None:
        raise RenderServiceError("Render job not found", status_code=404, code="NOT_FOUND")
    return job


@router.post("/start", response_model=StartRenderResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_render(
    payload: StartRenderRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> StartRenderResponse:
    """Start a native render job for one of the caller's runs."""
    project_id = await _owns_project(session, user, payload.project_id)
    if project_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    run_id = _parse_uuid(payload.run_id)
    run_project = (
        await session.scalar(select(GenerationRun.project_id).where(GenerationRun.id == run_id))
        if run_id is not None
        else None
    )
    if run_project != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    # The render-service writes wherever outputKey points; keep it inside this run.
    if not (
        is_project_object_key(payload.output_key, project_id)
        and payload.output_key.startswith(f"projects/{project_id}/runs/{run_id}/")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="outputKey must be inside this run's folder.",
        )
    metadata = payload.manifest.get("metadata")
    if not isinstance(metadata, dict) or metadata.get("project_id") != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Manifest project must match the requested render.",
        )
    if foreign_timeline_srcs(payload.manifest, project_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Timeline references media outside this project.",
        )
    # externalId dedupes jobs across the render-service; never let it attach to
    # another project's job.
    if payload.external_id is not None and not payload.external_id.startswith(f"{project_id}:"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="externalId must start with the project id.",
        )
    try:
        return await render_svc.start_render(
            manifest=payload.manifest,
            output_key=payload.output_key,
            project_id=payload.project_id,
            run_id=payload.run_id,
            external_id=payload.external_id,
        )
    except RenderServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY,
            detail={"detail": str(exc), "code": exc.code or "RENDER_SERVICE_ERROR"},
        ) from exc


@router.get("/{render_id}/status", response_model=RenderStatusResponse)
async def render_status(
    render_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> RenderStatusResponse:
    try:
        job = await _owned_job(render_svc, session, user, render_id)
        return RenderStatusResponse(job=job)
    except RenderServiceError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="Render job not found") from exc
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"detail": str(exc), "code": exc.code or "RENDER_SERVICE_ERROR"},
        ) from exc


@router.get("/{render_id}/result", response_model=RenderResultResponse)
async def render_result(
    render_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> RenderResultResponse:
    try:
        await _owned_job(render_svc, session, user, render_id)
        return await render_svc.get_result(str(render_id))
    except RenderServiceError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="Render job not found") from exc
        if exc.status_code == 409:
            raise HTTPException(
                status_code=409,
                detail={"detail": str(exc), "code": "NOT_READY"},
            ) from exc
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"detail": str(exc), "code": exc.code or "RENDER_SERVICE_ERROR"},
        ) from exc


@router.delete("/{render_id}", response_model=RenderStatusResponse)
async def cancel_render(
    render_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> RenderStatusResponse:
    try:
        await _owned_job(render_svc, session, user, render_id)
        job = await render_svc.cancel(str(render_id))
        return RenderStatusResponse(job=job)
    except RenderServiceError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="Render job not found") from exc
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"detail": str(exc), "code": exc.code or "RENDER_SERVICE_ERROR"},
        ) from exc
