from collections.abc import AsyncGenerator
import hmac

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db.models import Brief, EntryPath, FormatMode, Project, ProjectStatus, User
from app.db.session import get_session
from app.services.editor_snapshot_service import EditorSnapshotService
from app.services.generation_service import GenerationService
from app.services.progress_service import ProgressService
from app.services.project_service import ProjectService
from app.services.quote_service import QuoteService
from app.services.render_service import RenderServiceClient
from app.services.storage import StorageService, get_storage_service
from app.services.supabase_auth import supabase_auth_enabled, verify_supabase_access_token

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"
DEMO_SOURCE_PROJECT_ID = "498598ae-d9df-4e6f-b868-a4d591aa7797"
DEMO_PROJECT_TITLE = "Demo video: Elon Musk life story"
LEGACY_DEMO_PROJECT_TITLE = "SkyClip demo: Product launch"


async def _ensure_demo_project(session: AsyncSession, user: User) -> None:
    """Give every signed-in account one clearly-labelled, editable demo project.

    This is idempotent and intentionally creates only the project + brief. It does
    not start a paid generation or render job; the user can open it and run it as
    a demo from the normal studio flow.
    """
    existing = await session.execute(
        select(Project).options(selectinload(Project.brief)).where(
            Project.user_id == user.id,
        Project.title.in_((DEMO_PROJECT_TITLE, LEGACY_DEMO_PROJECT_TITLE)),
        ).limit(1)
    )
    project = existing.scalar_one_or_none()
    if project is not None:
        project.title = DEMO_PROJECT_TITLE
        project.workflow_id = DEMO_SOURCE_PROJECT_ID
        if project.brief is not None:
            project.brief.prompt_text = (
                "Create a polished video about Elon Musk's life story: "
                "how he started, the risks he took, and how he succeeded, "
                "with a strong hook, clear story, captions, B-roll, motion "
                "graphics, music, and tasteful sound effects."
            )
        await session.commit()
        return
    project = Project(
        user_id=user.id,
        title=DEMO_PROJECT_TITLE,
        status=ProjectStatus.DRAFT,
        entry_path=EntryPath.PROMPT_FIRST,
        format_mode=FormatMode.DOCUMENTARY,
        workflow_id=DEMO_SOURCE_PROJECT_ID,
    )
    session.add(project)
    session.add(Brief(
        project=project,
        prompt_text=(
            "Create a polished video about Elon Musk's life story: how he started, "
            "the risks he took, and how he succeeded, with a strong hook, clear "
            "story, captions, B-roll, motion graphics, music, and tasteful sound effects."
        ),
        target_duration_sec=60,
        language="en",
        model_id="hanuman-v1",
        brand_profile_id="bp-1",
    ))
    await session.commit()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def _upsert_user(
    session: AsyncSession,
    *,
    external_id: str,
    email: str | None,
) -> User:
    result = await session.execute(select(User).where(User.external_id == external_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(external_id=external_id, email=email)
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user
    if email and user.email != email:
        user.email = email
        await session.commit()
        await session.refresh(user)
    return user


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_external_id: str | None = Header(default=None, alias="X-User-External-Id"),
) -> User:
    """Resolve the caller via Supabase JWT when configured; else local stub."""
    try:
        if supabase_auth_enabled():
            token = _bearer_token(authorization)
            if not token:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Missing Bearer token. Sign in and retry.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            identity = await verify_supabase_access_token(token)
            if identity is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired session.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            # Never trust spoofable X-User-External-Id when Supabase Auth is on.
            user = await _upsert_user(
                session, external_id=identity.sub, email=identity.email
            )
            await _ensure_demo_project(session, user)
            return user

        # Dev identity is deliberately available only in explicit stub mode.
        # With auth missing in real mode, never accept a caller-controlled user id.
        if not settings.hanuman_stub_mode:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication is not configured.",
            )
        external_id = (x_user_external_id or settings.dev_user_external_id).strip()
        result = await session.execute(select(User).where(User.external_id == external_id))
        user = result.scalar_one_or_none()
    except HTTPException:
        raise
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
    expected = settings.internal_api_key.strip()
    if not expected or not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal key")
