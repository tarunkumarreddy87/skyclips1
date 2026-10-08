from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings

logger = logging.getLogger(__name__)


def _validate_runtime_security() -> None:
    auth_configured = bool(
        settings.supabase_url.strip()
        and (settings.supabase_jwt_secret.strip() or settings.supabase_anon_key.strip())
    )
    errors: list[str] = []
    if not settings.hanuman_stub_mode and not auth_configured:
        errors.append("Supabase Auth must be configured when HANUMAN_STUB_MODE=false")
    if settings.app_environment == "production":
        if settings.hanuman_stub_mode:
            errors.append("HANUMAN_STUB_MODE must be false in production")
        if settings.internal_api_key == "dev-internal" or len(settings.internal_api_key) < 32:
            errors.append("INTERNAL_API_KEY must be a strong, non-default secret in production")
    elif settings.internal_api_key == "dev-internal":
        logger.warning("Using development INTERNAL_API_KEY; never expose this API publicly")
    if errors:
        raise RuntimeError("Unsafe API configuration: " + "; ".join(errors))


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    _validate_runtime_security()
    yield


app = FastAPI(
    title="HANUMAN API",
    version="0.1.0",
    description="AI video generation platform API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "hanuman-api", "docs": "/docs"}
