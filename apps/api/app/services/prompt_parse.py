"""Shared prompt-duration/language helpers used by API (mirrors orchestrator parsing)."""

from __future__ import annotations

import re

_DURATION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(\d{1,3})\s*[- ]?(?:mins?|minutes?)\b", re.I), "minutes"),
    (re.compile(r"\b(\d{1,3})\s*m\b", re.I), "minutes"),
    (re.compile(r"\b(\d{1,5})\s*(?:seconds?|secs?|s)\b", re.I), "seconds"),
    (re.compile(r"\b(\d{1,2})\s*[- ]?hours?\b", re.I), "hours"),
]

_LANGUAGE_ALIASES: dict[str, str] = {
    "english": "en",
    "hindi": "hi",
    "telugu": "te",
    "తెలుగు": "te",
    "tamil": "ta",
    "kannada": "kn",
    "malayalam": "ml",
    "bengali": "bn",
    "marathi": "mr",
    "gujarati": "gu",
    "punjabi": "pa",
}


def parse_duration_sec(text: str | None, *, default: int | None = None) -> int | None:
    if not text:
        return default
    for pattern, unit in _DURATION_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value = int(match.group(1))
        if unit == "hours":
            sec = value * 3600
        elif unit == "minutes":
            sec = value * 60
        else:
            sec = value
        return max(30, min(sec, 3600))
    return default


def parse_language_code(text: str | None, *, default: str = "en") -> str:
    if not text:
        return default
    lowered = text.lower()
    for name, code in sorted(_LANGUAGE_ALIASES.items(), key=lambda x: -len(x[0])):
        if name in text or re.search(rf"\b{re.escape(name)}\b", lowered):
            return code
    return default


def clamp_duration_sec(sec: int | None, *, default: int = 300) -> int:
    if sec is None:
        return default
    return max(30, min(int(sec), 3600))
