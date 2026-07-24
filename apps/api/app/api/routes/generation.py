import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_db,
    get_editor_snapshot_service,
    get_generation_service,
    get_progress_service,
    verify_internal_key,
)
from app.db.models import User
from app.schemas.generation import (
    ArtifactResponse,
    GenerationRunResponse,
    InternalArtifactRequest,
    InternalProgressEventRequest,
    InternalRunStatusRequest,
    ProgressEventResponse,
    RenderTimelineRequest,
    RestoreSnapshotResponse,
    SaveTimelineRequest,
    SaveTimelineResponse,
    StartGenerationRequest,
    StartGenerationResponse,
    TimelineResponse,
    TimelineSnapshotMeta,
)
from app.services.editor_snapshot_service import EditorSnapshotService
from app.services.generation_service import GenerationService
from app.services.internal_service import InternalService
from app.services.progress_service import ProgressService

router = APIRouter()


@router.post("/projects/{project_id}/generate", response_model=StartGenerationResponse)
async def start_generation(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service),
    payload: StartGenerationRequest | None = None,
) -> StartGenerationResponse:
    return await service.start_generation(
        user,
        project_id,
        brand_compliance=payload.brand_compliance if payload else None,
    )


@router.post("/projects/{project_id}/render", response_model=StartGenerationResponse)
async def start_render(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service),
    payload: RenderTimelineRequest | None = None,
) -> StartGenerationResponse:
    return await service.start_render(
        user, project_id, timeline_manifest=payload.timeline_manifest if payload else None
    )


@router.get("/projects/{project_id}/runs/latest", response_model=GenerationRunResponse | None)
async def latest_run(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service),
) -> GenerationRunResponse | None:
    return await service.get_latest_run(user, project_id)


@router.get("/projects/{project_id}/timeline", response_model=TimelineResponse)
async def get_timeline(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: EditorSnapshotService = Depends(get_editor_snapshot_service),
) -> TimelineResponse:
    return await service.get_editor_timeline(user, project_id)


@router.put("/projects/{project_id}/timeline", response_model=SaveTimelineResponse)
async def save_timeline(
    project_id: uuid.UUID,
    payload: SaveTimelineRequest,
    user: User = Depends(get_current_user),
    service: EditorSnapshotService = Depends(get_editor_snapshot_service),
) -> SaveTimelineResponse:
    return await service.save_timeline(user, project_id, payload)


@router.get("/projects/{project_id}/timeline/snapshots", response_model=list[TimelineSnapshotMeta])
async def list_timeline_snapshots(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: EditorSnapshotService = Depends(get_editor_snapshot_service),
) -> list[TimelineSnapshotMeta]:
    return await service.list_snapshots(user, project_id)


@router.post(
    "/projects/{project_id}/timeline/snapshots/{snapshot_id}/restore",
    response_model=RestoreSnapshotResponse,
)
async def restore_timeline_snapshot(
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: EditorSnapshotService = Depends(get_editor_snapshot_service),
) -> RestoreSnapshotResponse:
    return await service.restore_snapshot(user, project_id, snapshot_id)


@router.post("/projects/{project_id}/timeline/reset", response_model=RestoreSnapshotResponse)
async def reset_timeline(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: EditorSnapshotService = Depends(get_editor_snapshot_service),
) -> RestoreSnapshotResponse:
    return await service.reset_timeline(user, project_id)


@router.get("/projects/{project_id}/video", response_model=ArtifactResponse)
async def download_video(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service),
) -> ArtifactResponse:
    return await service.get_final_video(user, project_id)


@router.get("/projects/{project_id}/progress/events", response_model=list[ProgressEventResponse])
async def list_progress(
    project_id: uuid.UUID,
    run_id: uuid.UUID | None = Query(default=None, alias="runId"),
    user: User = Depends(get_current_user),
    service: ProgressService = Depends(get_progress_service),
) -> list[ProgressEventResponse]:
    return await service.list_events(user, project_id, run_id=run_id)


@router.get("/projects/{project_id}/progress")
async def stream_progress(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: ProgressService = Depends(get_progress_service),
):
    return StreamingResponse(
        service.stream_events(user, project_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # Critical: tells nginx/ALB/Next.js rewrite proxy NOT to buffer the SSE
            # stream. Without this, events pile up in a buffer and only flush on
            # connection close — which is why the queue page only updates on reload.
            "X-Accel-Buffering": "no",
        },
    )


internal_router = APIRouter(prefix="/internal", tags=["internal"])


@internal_router.post("/progress-events", response_model=ProgressEventResponse)
async def internal_progress(
    payload: InternalProgressEventRequest,
    _: None = Depends(verify_internal_key),
    session: AsyncSession = Depends(get_db),
):
    return await InternalService(session).record_progress(payload)


@internal_router.post("/artifacts")
async def internal_artifact(
    payload: InternalArtifactRequest,
    _: None = Depends(verify_internal_key),
    session: AsyncSession = Depends(get_db),
):
    artifact_id = await InternalService(session).register_artifact(payload)
    return {"artifactId": artifact_id}


@internal_router.post("/runs/{run_id}/status")
async def internal_run_status(
    run_id: uuid.UUID,
    payload: InternalRunStatusRequest,
    _: None = Depends(verify_internal_key),
    session: AsyncSession = Depends(get_db),
):
    await InternalService(session).update_run_status(run_id, payload)
    return {"ok": True}
