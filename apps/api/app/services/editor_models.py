"""Discover model names and vision support from the configured provider."""
import hashlib
import logging
import re
import time
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.config import settings

logger = logging.getLogger(__name__)
_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}
_GOOGLE_CHAT_VISION = re.compile(r"^gemini-[23](?:\.\d+)?-(?:flash|pro)(?:-|$)", re.I)
_GOOGLE_NON_CHAT = re.compile(r"(?:^|[-_/])(?:embedding|embed|imagen|veo|lyria|aqa|tts|audio|live|image|robotics|deep-research)(?:[-_/]|$)", re.I)


def _google_models_endpoint(base_url: str) -> str | None:
    parsed = urlsplit(base_url)
    if parsed.hostname != "generativelanguage.googleapis.com" or not parsed.path.rstrip("/").endswith("/openai"):
        return None
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/")[:-len("/openai")] + "/models", "", ""))


def normalize_model_id(model_id: str) -> str:
    """Google lists resource names but compatible completions use bare model IDs."""
    if _google_models_endpoint(settings.openrouter_base_url) and model_id.startswith("models/"):
        return model_id[len("models/"):]
    return model_id


async def _google_metadata(client: httpx.AsyncClient, endpoint: str, api_key: str) -> dict[str, dict[str, Any]]:
    metadata: dict[str, dict[str, Any]] = {}
    params = {"pageSize": "1000"}
    try:
        for _ in range(4):
            response = await client.get(endpoint, headers={"x-goog-api-key": api_key}, params=params)
            response.raise_for_status()
            payload = response.json()
            for model in payload.get("models", []):
                if isinstance(model, dict) and isinstance(model.get("name"), str):
                    metadata[model["name"].removeprefix("models/")] = model
            if not payload.get("nextPageToken"):
                break
            params["pageToken"] = payload["nextPageToken"]
    except (httpx.HTTPError, ValueError, TypeError):
        # The compatible catalog remains authoritative if optional metadata fails.
        logger.warning("Optional Google model metadata unavailable")
    return metadata


def _normalize_models(rows: list[dict[str, Any]], *, google: bool, metadata: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    models = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
            continue
        model_id = row["id"].removeprefix("models/") if google else row["id"]
        info = metadata.get(model_id, {})
        if google and (_GOOGLE_NON_CHAT.search(model_id) or (
            "supportedGenerationMethods" in info and "generateContent" not in info["supportedGenerationMethods"]
        )):
            continue
        architecture = row.get("architecture") or {}
        if "text" not in architecture.get("output_modalities", ["text"]) or model_id in seen:
            continue
        seen.add(model_id)
        # Ordinary Gemini 2/3 Flash/Pro models accept image inputs through the
        # documented compatible chat API. Explicit modality metadata takes priority.
        ordinary_gemini = google and bool(_GOOGLE_CHAT_VISION.match(model_id))
        vision = "image" in architecture["input_modalities"] if "input_modalities" in architecture else ordinary_gemini
        models.append({"id": model_id, "name": row.get("name") or row.get("display_name") or info.get("displayName") or model_id,
                       "vision": vision, "contextLength": row.get("context_length") or info.get("inputTokenLimit"),
                       "structured": "response_format" in row.get("supported_parameters", []) or ordinary_gemini})
    return models


async def editor_models() -> dict[str, Any]:
    base_url = settings.openrouter_base_url.rstrip("/")
    api_key = settings.openrouter_api_key
    cache_key = (base_url, hashlib.sha256(api_key.encode()).hexdigest())
    cached = _cache.get(cache_key)
    if not cached or time.monotonic() - cached[0] > 900:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            response = await client.get(f"{base_url}/models", headers=headers)
            response.raise_for_status()
            endpoint = _google_models_endpoint(base_url)
            metadata = await _google_metadata(client, endpoint, api_key) if endpoint and api_key else {}
        models = _normalize_models(response.json().get("data", []), google=bool(endpoint), metadata=metadata)
        if len(_cache) >= 8 and cache_key not in _cache:
            _cache.pop(next(iter(_cache)))
        _cache[cache_key] = (time.monotonic(), models)
    else:
        models = cached[1]
    default_model = normalize_model_id(settings.editor_agent_fast_model or settings.openrouter_model)
    vision_ids = {model["id"] for model in models if model["vision"]}
    configured_vision = normalize_model_id(settings.editor_agent_vision_model)
    vision_model = next((candidate for candidate in (configured_vision, default_model) if candidate in vision_ids),
                        next((model["id"] for model in models if model["vision"]), ""))
    return {"models": models, "configured": settings.openrouter_configured,
            "defaultModel": default_model, "visionModel": vision_model}
