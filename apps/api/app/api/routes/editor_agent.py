import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_project_service
from app.db.models import User
from app.services.editor_agent_service import plan_editor_ops
from app.services.project_service import ProjectService

router = APIRouter()


class EditorAgentContext(BaseModel):
    playheadMs: int = 0
    selectedItemId: str | None = None
    selectedTransitionId: str | None = None
    durationMs: int = 0
    summary: str = ""


class EditorAgentPlanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    speed: Literal["fast", "smart"] = "fast"
    context: EditorAgentContext = Field(default_factory=EditorAgentContext)


class EditorAgentPlanResponse(BaseModel):
    reply: str
    ops: list[dict[str, Any]] = Field(default_factory=list)
    refused: bool = False


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
        result = await plan_editor_ops(
            message=body.message,
            context=body.context.model_dump(),
            speed=body.speed,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Editor agent planning failed: {exc}",
        ) from exc

    return EditorAgentPlanResponse(
        reply=str(result.get("reply") or ""),
        ops=list(result.get("ops") or []),
        refused=bool(result.get("refused")),
    )
