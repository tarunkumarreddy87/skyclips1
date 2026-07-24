"""OpenRouter chat completions client."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

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
# openrouter/free sometimes routes to safety/classifier stubs that return tiny non-JSON.
_BAD_MODEL_MARKERS = (
    "content-safety",
    "moderation",
    "prompt-guard",
    "classifier",
)


def _is_useless_completion(content: str, model: str | None) -> str | None:
    """Return a reason string if the completion should be retried, else None."""
    text = (content or "").strip()
    model_l = (model or "").lower()
    if any(m in model_l for m in _BAD_MODEL_MARKERS):
        return f"bad_model={model}"
    if not text:
        return f"empty_content model={model}"
    # Free-router stubs often return a few words / refuse JSON.
    if len(text) < 80:
        return f"too_short chars={len(text)} model={model}"
    return None


async def chat_completion_detailed(
    *,
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> ChatCompletionResult:
    if not settings.openrouter_configured:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured")

    payload = {
        "model": model or settings.openrouter_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "HANUMAN",
    }

    url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=180.0) as client:
        for attempt in range(1, 6):
            if attempt > 1:
                await asyncio.sleep(min(10.0, 1.5 * (2 ** (attempt - 2))))
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                last_error = OpenRouterError(
                    f"OpenRouter HTTP {response.status_code}: {response.text[:500]}"
                )
                if response.status_code in _RETRYABLE_HTTP and attempt < 5:
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
                    model=data.get("model") or (model or settings.openrouter_model),
                )
            except (KeyError, IndexError, TypeError) as exc:
                last_error = OpenRouterError(f"Unexpected OpenRouter response: {data!r}")
                last_error.__cause__ = exc
                continue
            reason = _is_useless_completion(result.content, result.model)
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
) -> str:
    result = await chat_completion_detailed(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return result.content
