import uuid
import asyncio
import logging
import httpx
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_project_service
from app.db.models import User
from app.services.editor_agent_service import plan_editor_ops
from app.services.editor_visual_evidence import EditorVisualEvidence
from app.services.editor_models import editor_models
from app.services.project_service import ProjectService

router = APIRouter()
logger = logging.getLogger(__name__)


class EditorAgentContext(BaseModel):
    visualEvidence: list[EditorVisualEvidence] = Field(default_factory=list, max_length=3)
    profileId: str | None = Field(default=None, max_length=128)
    # Timeline math can produce fractional milliseconds; accept them at the API boundary.
    playheadMs: float = 0
    selectedItemId: str | None = None
    selectedItemIds: list[str] = Field(default_factory=list, max_length=240)
    filters: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    effects: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    soundLibrary: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    selectedTransitionId: str | None = None
    durationMs: float = 0
    summary: str = ""
    scenes: list[dict[str, Any]] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)
    transitions: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)
    assets: list[dict[str, Any]] = Field(default_factory=list)


class EditorAgentPlanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    speed: Literal["fast", "smart"] = "fast"
    context: EditorAgentContext = Field(default_factory=EditorAgentContext)
    referenceImageUrl: str | None = Field(default=None, max_length=5_000_000, pattern=r"^(https?://|data:image/(png|jpeg|webp);base64,)")
    modelId: str | None = Field(default=None, max_length=160)
    conversation: list[dict[str, str]] = Field(default_factory=list, max_length=8)


class EditorAgentPlanResponse(BaseModel):
    reply: str
    ops: list[dict[str, Any]] = Field(default_factory=list)
    refused: bool = False
    modelUsed: str | None = None
    visionModelUsed: str | None = None


@router.get("/editor-agent/models")
async def list_editor_models(user: User = Depends(get_current_user)):
    try:
        return await editor_models()
    except Exception as exc:
        logger.warning("Editor model catalog failed: type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not load the model catalog.") from exc


@router.post(
    "/projects/{project_id}/editor-agent/plan",
    response_model=EditorAgentPlanResponse,
)
async def plan_editor_agent(
    project_id: uuid.UUID,
    body: EditorAgentPlanRequest,
    user: User = Depends(get_current_user),
    projects: ProjectService = Depends(get_project_service),
) -> EditorAgentPlanResponse:
    # Authz: ensure project belongs to user
    await projects.get_project(user, project_id)

    try:
        context = body.context.model_dump()
        context["htmlTemplateLibrary"] = []
        result = await plan_editor_ops(
            message=body.message,
            context=context,
            speed=body.speed,
            reference_image_url=body.referenceImageUrl,
            model_id=body.modelId,
            conversation=body.conversation,
        )
    except Exception as exc:
        logger.warning("Editor agent planning failed: type=%s status=%s", type(exc).__name__, exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None)
        error_status = status.HTTP_502_BAD_GATEWAY
        detail = "The AI provider could not complete this request. No edits were applied. Please retry."
        if isinstance(exc, ValueError):
            detail = str(exc)
        elif isinstance(exc, httpx.TimeoutException):
            error_status = status.HTTP_504_GATEWAY_TIMEOUT
            detail = "The model took too long to respond. No edits were applied. Try a smaller request or another model."
        elif isinstance(exc, httpx.HTTPStatusError):
            provider_status = exc.response.status_code
            if provider_status in {400, 404, 422}:
                detail = "This model is unavailable or could not accept the editing request. Choose Default model or another model. No edits were applied."
            elif provider_status == 429:
                error_status = status.HTTP_503_SERVICE_UNAVAILABLE
                detail = "The model is busy or rate-limited. No edits were applied. Retry shortly or choose another model."
            elif provider_status in {401, 402, 403}:
                detail = "AI editing needs the server's provider access or credits checked. No edits were applied."
        raise HTTPException(
            status_code=error_status,
            detail=detail,
        ) from exc

    return EditorAgentPlanResponse(
        reply=str(result.get("reply") or ""),
        ops=list(result.get("ops") or []),
        refused=bool(result.get("refused")),
        modelUsed=result.get("modelUsed"),
        visionModelUsed=result.get("visionModelUsed"),
    )
