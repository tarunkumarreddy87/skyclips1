"""Preview proxy derivation (540p / poster / sprite) for editor media."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field

from app.api.deps import get_current_user, get_project_service, get_storage
from app.db.models import User
from app.schemas.common import ApiModel
from app.services.project_service import ProjectService
from app.services.proxy_media_service import ProxyMediaService, ffmpeg_available
from app.services.storage import StorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects")

# FFmpeg derive is CPU-heavy; never run it on the asyncio event loop or /projects
# (and the whole editor) stall while proxies encode.
# 3 concurrent derives on a 2-vCPU ECS task is safe and triples throughput vs semaphore=1.
_DERIVE_SEM = asyncio.Semaphore(3)


class DeriveProxiesRequest(ApiModel):
    source_key: str = Field(alias="sourceKey", min_length=1, max_length=2048)
    force: bool = False
    make_sprite: bool = Field(default=True, alias="makeSprite")


class DeriveProxiesResponse(ApiModel):
    source_key: str = Field(serialization_alias="sourceKey")
    proxy_key: str = Field(serialization_alias="proxyKey")
    poster_key: str = Field(serialization_alias="posterKey")
    sprite_key: str | None = Field(default=None, serialization_alias="spriteKey")
    proxy_url: str = Field(serialization_alias="proxyUrl")
    poster_url: str = Field(serialization_alias="posterUrl")
    sprite_url: str | None = Field(default=None, serialization_alias="spriteUrl")


class ProxyStatusRequest(ApiModel):
    source_keys: list[str] = Field(alias="sourceKeys", max_length=400)


class ProxyStatusResponse(ApiModel):
    """Already-derived proxies, so the editor can play video without waiting on FFmpeg."""

    ready: list[DeriveProxiesResponse]
    missing: list[str]


def _validate_source_key(source_key: str, project_id: uuid.UUID) -> str:
    key = source_key.strip()
    if not key.startswith(f"projects/{project_id}/") or ".." in key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sourceKey must belong to this project",
        )
    return key


@router.post("/{project_id}/media/proxy-status", response_model=ProxyStatusResponse)
async def proxy_status(
    project_id: uuid.UUID,
    payload: ProxyStatusRequest,
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
    storage: StorageService = Depends(get_storage),
) -> ProxyStatusResponse:
    """Batch lookup of existing proxies (HEAD only, no FFmpeg).

    Lets the editor swap posters for real proxy video on load instead of queueing
    behind the single-slot derive semaphore for every clip.
    """
    await service.get_project(user, project_id)

    keys: list[str] = []
    seen: set[str] = set()
    for raw in payload.source_keys:
        key = _validate_source_key(raw, project_id)
        if key not in seen:
            seen.add(key)
            keys.append(key)
    if not keys:
        return ProxyStatusResponse(ready=[], missing=[])

    proxy_svc = ProxyMediaService(storage)
    sem = asyncio.Semaphore(16)

    async def check(key: str) -> tuple[str, dict[str, str] | None]:
        async with sem:
            return key, await asyncio.to_thread(proxy_svc.existing_proxies, key)

    results = await asyncio.gather(*(check(k) for k in keys))

    ready: list[DeriveProxiesResponse] = []
    missing: list[str] = []
    for key, found in results:
        if not found:
            missing.append(key)
            continue
        ready.append(
            DeriveProxiesResponse(
                source_key=key,
                proxy_key=found["proxyKey"],
                poster_key=found["posterKey"],
                sprite_key=found.get("spriteKey"),
                proxy_url=found["proxyUrl"],
                poster_url=found["posterUrl"],
                sprite_url=found.get("spriteUrl"),
            )
        )
    return ProxyStatusResponse(ready=ready, missing=missing)


@router.post(
    "/{project_id}/media/derive-proxies",
    response_model=DeriveProxiesResponse,
)
async def derive_media_proxies(
    project_id: uuid.UUID,
    payload: DeriveProxiesRequest,
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
    storage: StorageService = Depends(get_storage),
) -> DeriveProxiesResponse:
    """Generate (or reuse) preview proxy + poster (+ sprite) for an uploaded video key."""
    await service.get_project(user, project_id)

    source_key = _validate_source_key(payload.source_key, project_id)

    if not ffmpeg_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ffmpeg not available on API host; install ffmpeg or rebuild API image",
        )

    try:
        proxy_svc = ProxyMediaService(storage)

        # Sign against the internal storage endpoint so container FFmpeg can
        # stream the source. Browser-facing URLs keep their public endpoint.
        # Falls back to the full-download path if presigning fails.
        presigned_url: str | None = None
        try:
            presigned_url = storage.presigned_internal_download_url(
                source_key, expires_in=3600
            )
        except Exception:
            presigned_url = None

        def _derive() -> dict[str, str]:
            return proxy_svc.derive_proxies(
                source_key,
                force=payload.force,
                make_sprite=payload.make_sprite,
                presigned_url=presigned_url,
            )

        async with _DERIVE_SEM:
            result = await asyncio.to_thread(_derive)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("derive-proxies failed for %s", source_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Preview media could not be prepared. Please try again.",
        ) from exc

    return DeriveProxiesResponse(
        source_key=source_key,
        proxy_key=result["proxyKey"],
        poster_key=result["posterKey"],
        sprite_key=result.get("spriteKey"),
        proxy_url=result["proxyUrl"],
        poster_url=result["posterUrl"],
        sprite_url=result.get("spriteUrl"),
    )
