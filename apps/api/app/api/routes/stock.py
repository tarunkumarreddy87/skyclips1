"""Authenticated stock photo search — proxies Pexels for the editor media browser."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.config import Settings
from app.db.models import User

router = APIRouter(prefix="/stock", tags=["stock"])


class StockPhoto(BaseModel):
    id: str
    label: str
    url: str
    thumbnailUrl: str
    photographer: str | None = None
    source: str = "pexels"


class StockSearchResponse(BaseModel):
    items: list[StockPhoto] = Field(default_factory=list)
    query: str
    configured: bool


@router.get("/photos", response_model=StockSearchResponse)
async def search_stock_photos(
    q: str = Query("", max_length=120),
    per_page: int = Query(24, ge=1, le=40),
    _: User = Depends(get_current_user),
) -> StockSearchResponse:
    settings = Settings()
    query = (q or "").strip() or "cinematic landscape"
    if not settings.pexels_api_key.strip():
        return StockSearchResponse(items=[], query=query, configured=False)

    headers = {"Authorization": settings.pexels_api_key.strip()}
    params = {"query": query, "per_page": per_page, "orientation": "landscape"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://api.pexels.com/v1/search",
                headers=headers,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Pexels unreachable: {exc}") from exc

    if response.status_code == 401:
        raise HTTPException(status_code=502, detail="Pexels API key rejected")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Pexels error HTTP {response.status_code}")

    payload = response.json()
    photos = payload.get("photos") or []
    items: list[StockPhoto] = []
    for photo in photos:
        src = photo.get("src") or {}
        url = src.get("large2x") or src.get("large") or src.get("original") or ""
        thumb = src.get("medium") or src.get("small") or url
        if not url:
            continue
        alt = (photo.get("alt") or "").strip() or f"Photo {photo.get('id')}"
        items.append(
            StockPhoto(
                id=f"pexels-{photo.get('id')}",
                label=alt[:80],
                url=url,
                thumbnailUrl=thumb,
                photographer=(photo.get("photographer") or None),
                source="pexels",
            )
        )
    return StockSearchResponse(items=items, query=query, configured=True)
