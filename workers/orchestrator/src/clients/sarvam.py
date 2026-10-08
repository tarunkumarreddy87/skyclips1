"""Sarvam.ai streaming text-to-speech client.

API docs: https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert-stream
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from src.config import settings

logger = logging.getLogger(__name__)

SARVAM_TTS_STREAM_URL = "https://api.sarvam.ai/text-to-speech/stream"

# Map brief/quote language codes to Sarvam BCP-47 codes.
LANGUAGE_MAP: dict[str, str] = {
    "en": "en-IN",
    "hi": "hi-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "mr": "mr-IN",
    "od": "od-IN",
    "or": "od-IN",
    "pa": "pa-IN",
    "ta": "ta-IN",
    "te": "te-IN",
}

# Official bulbul:v3 speaker ids (API rejects anything else).
SARVAM_SPEAKERS: frozenset[str] = frozenset(
    {
        "aditya",
        "ritu",
        "priya",
        "neha",
        "rahul",
        "pooja",
        "rohan",
        "simran",
        "kavya",
        "amit",
        "dev",
        "ishita",
        "shreya",
        "ratan",
        "varun",
        "manan",
        "sumit",
        "roopa",
        "kabir",
        "aayan",
        "shubh",
        "ashutosh",
        "advait",
        "anand",
        "tanya",
        "tarun",
        "sunny",
        "mani",
        "gokul",
        "vijay",
        "shruti",
        "suhani",
        "mohit",
        "kavitha",
        "rehan",
        "soham",
        "rupali",
    }
)

# UI / brand-profile aliases → real Sarvam speaker ids.
SPEAKER_ALIASES: dict[str, str] = {
    "sarvam-hi": "kavya",
    "sarvam-en-in": "aditya",
    "sarvam-en-us": "aditya",
    "eleven-clive": "shubh",
    "eleven-david": "aditya",
    "eleven-sarah": "kavya",
    "eleven-aria": "ritu",
    "hanuman-neutral": "shubh",
}

# Vendor hard limit is 3500; callers should chunk below this.
SARVAM_TTS_MAX_CHARS = 3500

# Retryable statuses: rate-limit / transient server errors.
# 402 (payment required / no credits) is NOT retryable beyond a short confirm retry.
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 4


class SarvamTTSError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


class SarvamQuotaError(SarvamTTSError):
    """Billing / credits exhausted — do not silently continue."""

    def __init__(self, message: str, *, status_code: int = 402) -> None:
        super().__init__(message, status_code=status_code, retryable=False)


def resolve_target_language(language: str) -> str:
    normalized = language.strip().lower()
    if normalized in LANGUAGE_MAP:
        return LANGUAGE_MAP[normalized]
    base = normalized.split("-", 1)[0]
    if base in LANGUAGE_MAP:
        return LANGUAGE_MAP[base]
    raise ValueError(f"Narration language {language!r} is not supported by the configured voice provider")


def resolve_speaker(speaker: str | None) -> str:
    """Map quote/brand voice ids to a Sarvam-recognized speaker name."""
    raw = (speaker or settings.sarvam_tts_speaker).strip().lower()
    if not raw:
        return settings.sarvam_tts_speaker.lower()
    mapped = SPEAKER_ALIASES.get(raw, raw)
    if mapped in SARVAM_SPEAKERS:
        return mapped
    fallback = settings.sarvam_tts_speaker.lower()
    if fallback not in SARVAM_SPEAKERS:
        fallback = "shubh"
    logger.warning(
        "Unknown Sarvam speaker %r (alias→%r); falling back to %s",
        speaker,
        mapped,
        fallback,
    )
    return fallback


def _classify_error(status_code: int, body: str) -> SarvamTTSError:
    lower = body.lower()
    msg = f"Sarvam TTS HTTP {status_code}: {body[:500]}"
    if status_code == 402 or "insufficient_quota" in lower or "no credits" in lower or "payment" in lower:
        return SarvamQuotaError(msg, status_code=status_code)
    retryable = status_code in _RETRYABLE_STATUS
    return SarvamTTSError(msg, status_code=status_code, retryable=retryable)


async def synthesize_speech_stream(
    *,
    text: str,
    speaker: str | None = None,
    target_language_code: str | None = None,
    model: str | None = None,
    output_audio_codec: str | None = None,
    speech_sample_rate: int | None = None,
    pace: float | None = None,
) -> bytes:
    """Call Sarvam TTS stream endpoint and return full audio bytes (with retries)."""
    if not settings.sarvam_configured:
        raise SarvamTTSError("SARVAM_API_KEY is not configured", retryable=False)

    if not text.strip():
        raise SarvamTTSError("TTS text must not be empty", retryable=False)

    payload: dict = {
        "text": text[:SARVAM_TTS_MAX_CHARS],
        "target_language_code": target_language_code or settings.sarvam_tts_language,
        "speaker": resolve_speaker(speaker),
        "model": model or settings.sarvam_tts_model,
        "output_audio_codec": output_audio_codec or settings.sarvam_tts_output_codec,
        "speech_sample_rate": speech_sample_rate or settings.sarvam_tts_sample_rate,
        "pace": pace if pace is not None else settings.sarvam_tts_pace,
        "enable_preprocessing": False,
    }

    if payload["model"] == "bulbul:v3":
        payload["temperature"] = settings.sarvam_tts_temperature

    headers = {
        "api-subscription-key": settings.sarvam_api_key,
        "Content-Type": "application/json",
    }

    last_error: SarvamTTSError | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                async with client.stream(
                    "POST", SARVAM_TTS_STREAM_URL, json=payload, headers=headers
                ) as response:
                    if response.status_code != 200:
                        body = (await response.aread()).decode(errors="replace")
                        err = _classify_error(response.status_code, body)
                        last_error = err
                        if isinstance(err, SarvamQuotaError):
                            # One short confirm retry only — quota rarely recovers mid-run.
                            if attempt == 1:
                                logger.warning("Sarvam quota/billing error; confirming once: %s", err)
                                await asyncio.sleep(1.5)
                                continue
                            raise err
                        if err.retryable and attempt < _MAX_ATTEMPTS:
                            delay = min(2 ** attempt, 16)
                            logger.warning(
                                "Sarvam TTS attempt %s/%s failed (%s); retry in %ss",
                                attempt,
                                _MAX_ATTEMPTS,
                                response.status_code,
                                delay,
                            )
                            await asyncio.sleep(delay)
                            continue
                        raise err

                    chunks: list[bytes] = []
                    async for chunk in response.aiter_bytes():
                        chunks.append(chunk)

            audio = b"".join(chunks)
            if not audio:
                last_error = SarvamTTSError("Sarvam TTS returned empty audio stream", retryable=True)
                if attempt < _MAX_ATTEMPTS:
                    await asyncio.sleep(min(2 ** attempt, 8))
                    continue
                raise last_error
            return audio
        except SarvamTTSError:
            raise
        except httpx.HTTPError as exc:
            last_error = SarvamTTSError(f"Sarvam TTS network error: {exc}", retryable=True)
            if attempt < _MAX_ATTEMPTS:
                delay = min(2 ** attempt, 16)
                logger.warning(
                    "Sarvam TTS network attempt %s/%s failed; retry in %ss: %s",
                    attempt,
                    _MAX_ATTEMPTS,
                    delay,
                    exc,
                )
                await asyncio.sleep(delay)
                continue
            raise last_error from exc

    assert last_error is not None
    raise last_error
