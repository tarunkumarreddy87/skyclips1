"""Pexels API client for stock photo and video search."""

from __future__ import annotations

import httpx

from src.config import settings

PEXELS_API_URL = "https://api.pexels.com/v1"
PEXELS_VIDEO_API_URL = "https://api.pexels.com/videos"


class PexelsError(RuntimeError):
    pass


async def search_photos(query: str, *, per_page: int = 5, orientation: str = "landscape") -> list[dict]:
    if not settings.pexels_configured:
        raise PexelsError("PEXELS_API_KEY is not configured")

    headers = {"Authorization": settings.pexels_api_key}
    params: dict[str, str | int] = {"query": query, "per_page": per_page, "orientation": orientation}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{PEXELS_API_URL}/search", headers=headers, params=params)

    if response.status_code != 200:
        raise PexelsError(f"Pexels HTTP {response.status_code}: {response.text[:500]}")

    data = response.json()
    photos = data.get("photos", [])
    return [
        {
            "id": photo.get("id"),
            "url": photo.get("url"),
            "photographer": photo.get("photographer"),
            "src": photo.get("src", {}),
            "alt": photo.get("alt"),
        }
        for photo in photos
    ]


def _pick_video_file(video: dict) -> dict | None:
    """Prefer HD landscape MP4 under ~1080p for reasonable download size."""
    files = list(video.get("video_files") or [])
    mp4s: list[dict] = []
    for f in files:
        link = str(f.get("link") or "")
        ftype = str(f.get("file_type") or "").lower()
        if not link:
            continue
        if "mp4" in ftype or link.endswith(".mp4") or ".mp4" in link:
            mp4s.append(f)
    if not mp4s:
        mp4s = [f for f in files if f.get("link")]
    if not mp4s:
        return None

    def score(f: dict) -> tuple:
        w = int(f.get("width") or 0)
        h = int(f.get("height") or 0)
        fit = 0 if 1100 <= w <= 2000 else abs(w - 1280)
        landscape = 0 if w >= h else 10_000
        return (landscape, fit, -w)

    mp4s.sort(key=score)
    return mp4s[0]


async def search_videos(query: str, *, per_page: int = 5, orientation: str = "landscape") -> list[dict]:
    """Return normalized video hits with a preferred download URL."""
    if not settings.pexels_configured:
        raise PexelsError("PEXELS_API_KEY is not configured")

    headers = {"Authorization": settings.pexels_api_key}
    params: dict[str, str | int] = {"query": query, "per_page": per_page, "orientation": orientation}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{PEXELS_VIDEO_API_URL}/search",
            headers=headers,
            params=params,
        )

    if response.status_code != 200:
        raise PexelsError(f"Pexels videos HTTP {response.status_code}: {response.text[:500]}")

    data = response.json()
    videos = data.get("videos", [])
    out: list[dict] = []
    for video in videos:
        chosen = _pick_video_file(video)
        if not chosen or not chosen.get("link"):
            continue
        out.append(
            {
                "id": video.get("id"),
                "url": video.get("url"),
                "duration": video.get("duration"),
                "image": video.get("image"),
                "download_url": chosen.get("link"),
                "width": chosen.get("width"),
                "height": chosen.get("height"),
            }
        )
    return out
