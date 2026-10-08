"""OpenRouter chat completions client."""

from __future__ import annotations

import asyncio
import math
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from src.config import settings


class OpenRouterError(RuntimeError):
    pass


@dataclass(frozen=True)
class ChatCompletionResult:
    content: str
    finish_reason: str | None
    model: str | None
    native_finish_reason: str | None = None


_RETRYABLE_HTTP = {408, 429, 500, 502, 503, 504}


def _retry_delay(response: httpx.Response) -> float:
    """Honor bounded provider cooldowns instead of exhausting retries too early."""
    value = response.headers.get("retry-after", "")
    if not value:
        match = re.search(r"retry in\s+([\d.]+)s", response.text, re.IGNORECASE)
        value = match.group(1) if match else ""
    try:
        delay = float(value)
        return min(60., max(0., delay)) if math.isfinite(delay) else 0.
    except ValueError:
        return 0.
# openrouter/free sometimes routes to safety/classifier stubs that return tiny non-JSON.
_BAD_MODEL_MARKERS = (
    "content-safety",
    "moderation",
    "prompt-guard",
    "classifier",
)
_AVAILABLE_TOKEN_LIMIT = re.compile(r"can only afford\s+(\d+)\s+tokens", re.IGNORECASE)


def clamp_token_budget(requested: int, ceiling: int) -> int:
    """Keep a request under the available local provider budget setting."""
    return max(64, min(requested, ceiling))


def model_candidates(primary: str, fallback: str | None) -> tuple[str, ...]:
    """Return unique provider choices in deterministic preference order."""
    candidates = [primary.strip()]
    for fallback_model in (fallback or "").split(","):
        fallback_model = fallback_model.strip()
        if fallback_model and fallback_model not in candidates:
            candidates.append(fallback_model)
    return tuple(candidates)


def _is_nvidia_integrate(base_url: str) -> bool:
    return urlparse(base_url).hostname == "integrate.api.nvidia.com"


def provider_token_ceiling(error_body: str, current: int) -> int | None:
    """Return a safe retry budget for OpenRouter's remaining-credit 402 response."""
    match = _AVAILABLE_TOKEN_LIMIT.search(error_body or "")
    if not match:
        return None
    available = int(match.group(1))
    # Keep a small buffer for provider accounting; never increase the current ask.
    proposed = max(64, min(current - 1, available - 24))
    return proposed if proposed < current else None


def _is_useless_completion(content: str, model: str | None, min_content_chars: int = 80) -> str | None:
    """Return a reason string if the completion should be retried, else None."""
    text = (content or "").strip()
    model_l = (model or "").lower()
    if any(m in model_l for m in _BAD_MODEL_MARKERS):
        return f"bad_model={model}"
    if not text:
        return f"empty_content model={model}"
    # Free-router stubs often return a few words / refuse JSON.
    if len(text) < min_content_chars:
        return f"too_short chars={len(text)} model={model}"
    return None


async def chat_completion_detailed(
    *,
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    min_content_chars: int = 80,
) -> ChatCompletionResult:
    if not settings.openrouter_configured:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured")

    requested_tokens = clamp_token_budget(max_tokens, settings.openrouter_max_tokens)
    candidates = model_candidates(model or settings.openrouter_model, settings.openrouter_fallback_model)
    candidate_index = 0
    payload = {
        "model": candidates[candidate_index],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": requested_tokens,
    }
    if _is_nvidia_integrate(settings.openrouter_base_url):
        # NVIDIA's GPT-OSS endpoint supports this and low effort shortens latency
        # for structured generation while preserving the model's JSON capability.
        payload["reasoning_effort"] = "low"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "HANUMAN",
    }

    url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    max_attempts = 2 if _is_nvidia_integrate(settings.openrouter_base_url) else 5
    last_error: Exception | None = None
    retry_delay = 0.
    async with httpx.AsyncClient(timeout=settings.openrouter_timeout_seconds) as client:
        for attempt in range(1, max_attempts + 1):
            if attempt > 1:
                await asyncio.sleep(max(retry_delay, min(10.0, 1.5 * (2 ** (attempt - 2)))))
                retry_delay = 0.
            try:
                # httpx's timeout is per network operation. Wrap the whole request so
                # a provider that streams headers but stalls its body cannot pin a
                # Temporal activity indefinitely.
                response = await asyncio.wait_for(
                    client.post(url, json=payload, headers=headers),
                    timeout=settings.openrouter_timeout_seconds,
                )
            except (httpx.TimeoutException, httpx.TransportError, asyncio.TimeoutError) as exc:
                last_error = OpenRouterError(
                    f"OpenRouter request failed or timed out after {settings.openrouter_timeout_seconds:.0f}s: {exc}"
                )
                last_error.__cause__ = exc
                if candidate_index + 1 < len(candidates):
                    candidate_index += 1
                    payload["model"] = candidates[candidate_index]
                    continue
                if attempt < max_attempts:
                    continue
                raise last_error
            if response.status_code != 200:
                if response.status_code == 429:
                    retry_delay = _retry_delay(response)
                if response.status_code == 402 and attempt < max_attempts:
                    retry_budget = provider_token_ceiling(response.text, int(payload["max_tokens"]))
                    if retry_budget is not None:
                        payload["max_tokens"] = retry_budget
                        continue
                last_error = OpenRouterError(
                    f"OpenRouter HTTP {response.status_code}: {response.text[:500]}"
                )
                if response.status_code in _RETRYABLE_HTTP and candidate_index + 1 < len(candidates):
                    candidate_index += 1
                    payload["model"] = candidates[candidate_index]
                    continue
                if response.status_code in _RETRYABLE_HTTP and attempt < max_attempts:
                    continue
                raise last_error
            data = response.json()
            try:
                choice = data["choices"][0]
                content = choice["message"]["content"]
                if content is None:
                    content = ""
                content = str(content)
                result = ChatCompletionResult(
                    content=content,
                    finish_reason=choice.get("finish_reason"),
                    native_finish_reason=choice.get("native_finish_reason"),
                    model=data.get("model") or str(payload["model"]),
                )
            except (KeyError, IndexError, TypeError) as exc:
                last_error = OpenRouterError(f"Unexpected OpenRouter response: {data!r}")
                last_error.__cause__ = exc
                continue
            reason = _is_useless_completion(result.content, result.model, min_content_chars)
            if reason and candidate_index + 1 < len(candidates):
                candidate_index += 1
                payload["model"] = candidates[candidate_index]
                last_error = OpenRouterError(f"Retryable OpenRouter completion: {reason}")
                continue
            if reason and attempt < 5:
                last_error = OpenRouterError(f"Retryable OpenRouter completion: {reason}")
                continue
            if reason:
                last_error = OpenRouterError(f"Unusable OpenRouter completion: {reason}")
                continue
            return result
    raise last_error or OpenRouterError("OpenRouter request failed")


async def chat_completion(
    *,
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    min_content_chars: int = 80,
) -> str:
    result = await chat_completion_detailed(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        min_content_chars=min_content_chars,
    )
    return result.content
