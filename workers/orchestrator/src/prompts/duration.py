"""Parse duration and language hints from free-text prompts."""

from __future__ import annotations

import re

# Minutes mentioned in the prompt → seconds (clamped later by callers).
_DURATION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # 30mins, 30 min, 30minutes, 30-minute
    (re.compile(r"\b(\d{1,3})\s*[- ]?(?:mins?|minutes?)\b", re.I), "minutes"),
    # 30m (avoid matching 'am' etc. by requiring digit boundary)
    (re.compile(r"\b(\d{1,3})\s*m\b", re.I), "minutes"),
    # 90 seconds / 90s
    (re.compile(r"\b(\d{1,5})\s*(?:seconds?|secs?|s)\b", re.I), "seconds"),
    # ~2 hour / 1 hour
    (re.compile(r"\b(\d{1,2})\s*[- ]?hours?\b", re.I), "hours"),
]

_LANGUAGE_ALIASES: dict[str, str] = {
    "english": "en",
    "en": "en",
    "hindi": "hi",
    "hi": "hi",
    "telugu": "te",
    "te": "te",
    "తెలుగు": "te",
    "tamil": "ta",
    "ta": "ta",
    "kannada": "kn",
    "kn": "kn",
    "malayalam": "ml",
    "ml": "ml",
    "bengali": "bn",
    "bn": "bn",
    "marathi": "mr",
    "mr": "mr",
    "gujarati": "gu",
    "gu": "gu",
    "punjabi": "pa",
    "pa": "pa",
}


def parse_duration_sec(text: str | None, *, default: int | None = None) -> int | None:
    """Extract an explicit duration from user text. Returns seconds or default."""
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
    """Detect spoken language from phrases like 'in telugu language'."""
    if not text:
        return default
    lowered = text.lower()

    # Prefer explicit "in <lang>" / "<lang> language"
    for name, code in sorted(_LANGUAGE_ALIASES.items(), key=lambda x: -len(x[0])):
        if name in ("en", "hi", "te", "ta", "kn", "ml", "bn", "mr", "gu", "pa"):
            # Skip bare ISO codes unless phrased as language
            if re.search(rf"\b{re.escape(name)}\b(?:\s*language)?", lowered) and len(name) <= 2:
                if re.search(rf"\bin\s+{re.escape(name)}\b|\b{re.escape(name)}\s+language\b", lowered):
                    return code
                continue
        if re.search(rf"\b{re.escape(name)}\b", lowered) or name in text:
            return code
    return default


def clamp_duration_sec(sec: int | None, *, default: int = 300) -> int:
    if sec is None:
        return default
    return max(30, min(int(sec), 3600))
