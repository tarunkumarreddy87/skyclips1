from collections.abc import AsyncGenerator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import User
from app.db.session import get_session
from app.services.editor_snapshot_service import EditorSnapshotService
from app.services.generation_service import GenerationService
from app.services.progress_service import ProgressService
from app.services.project_service import ProjectService
from app.services.quote_service import QuoteService
from app.services.render_service import RenderServiceClient
from app.services.storage import StorageService, get_storage_service

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    x_user_external_id: str | None = Header(default=None, alias="X-User-External-Id"),
) -> User:
    """MVP auth stub: allow overriding user via header, default to dev user."""
    external_id = (x_user_external_id or settings.dev_user_external_id).strip()
    try:
        result = await session.execute(select(User).where(User.external_id == external_id))
        user = result.scalar_one_or_none()
    except Exception as exc:
        msg = str(exc).lower()
        if "does not exist" in msg or "undefinedtable" in msg:
            detail = "Database schema missing. Run migrations: make migrate (local) or alembic upgrade head (production)."
        else:
            detail = "Database unavailable. Run: make up && make migrate"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from exc
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"User '{external_id}' not found. Run: make migrate",
        )
    return user


def get_project_service(session: AsyncSession = Depends(get_db)) -> ProjectService:
    return ProjectService(session)


def get_quote_service(session: AsyncSession = Depends(get_db)) -> QuoteService:
    return QuoteService(session)


def get_storage() -> StorageService:
    return get_storage_service()


def get_generation_service(
    session: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage),
) -> GenerationService:
    return GenerationService(session, storage)


def get_editor_snapshot_service(
    session: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage),
) -> EditorSnapshotService:
    return EditorSnapshotService(session, storage)


def get_progress_service(session: AsyncSession = Depends(get_db)) -> ProgressService:
    return ProgressService(session)


def get_render_service() -> RenderServiceClient:
    return RenderServiceClient()


async def verify_internal_key(x_internal_key: str = Header(alias="X-Internal-Key")) -> None:
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal key")
