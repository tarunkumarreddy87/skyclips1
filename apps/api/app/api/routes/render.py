import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, get_render_service
from app.db.models import User
from app.schemas.render import (
    RenderResultResponse,
    RenderStatusResponse,
    StartRenderRequest,
    StartRenderResponse,
)
from app.services.render_service import RenderServiceClient, RenderServiceError

router = APIRouter(prefix="/render", tags=["render"])


@router.post("/start", response_model=StartRenderResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_render(
    payload: StartRenderRequest,
    user: User = Depends(get_current_user),
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> StartRenderResponse:
    """Start a Remotion Lambda render job."""
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
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> RenderStatusResponse:
    try:
        job = await render_svc.get_status(str(render_id))
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
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> RenderResultResponse:
    try:
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
    render_svc: RenderServiceClient = Depends(get_render_service),
) -> RenderStatusResponse:
    try:
        job = await render_svc.cancel(str(render_id))
        return RenderStatusResponse(job=job)
    except RenderServiceError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="Render job not found") from exc
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"detail": str(exc), "code": exc.code or "RENDER_SERVICE_ERROR"},
        ) from exc
