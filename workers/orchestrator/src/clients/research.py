"""Bounded online source excerpts for documentary planning (not model citations)."""
import asyncio
import serpapi
from src.config import settings
from src.clients.web_media import public_host, WebMediaError


async def search_topic_sources(topic: str, blocked: list[str]) -> list[dict]:
    if not settings.serpapi_api_key.strip():
        return []
    try:
        client = serpapi.Client(api_key=settings.serpapi_api_key, timeout=25)
        payload = await asyncio.to_thread(client.search, {
            "engine": "google", "q": topic[:400], "num": 6, "safe": "active",
        })
        if payload.get("error"):
            return []
    except Exception:
        # Provider exception URLs may contain credentials. Never log them.
        return []
    sources = []
    for item in payload.get("organic_results", [])[:6]:
        url, excerpt = str(item.get("link") or ""), str(item.get("snippet") or "").strip()
        try:
            public_host(url, blocked)
        except WebMediaError:
            continue
        if excerpt:
            sources.append({"url": url, "title": str(item.get("title") or "")[:200], "excerpt": excerpt[:1200]})
    return sources
