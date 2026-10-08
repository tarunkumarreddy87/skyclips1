"""Stable metadata relevance ranking; never treat provider order as a match score."""
import re
from urllib.parse import unquote, urlparse

_GENERIC = {"a", "an", "the", "of", "in", "on", "and", "with", "for", "to", "photo", "video", "documentary", "shot", "image", "cinematic", "footage", "stock", "www", "com", "pexels"}


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z]{3,}", text.lower()) if word not in _GENERIC}


def rank_media(candidates: list[dict], query: str) -> list[dict]:
    wanted = _tokens(query)
    def score(candidate: dict) -> float:
        # Asset URLs contain provider IDs and filenames; use the descriptive
        # public page slug and alt text, never download links or photographer names.
        description = str(candidate.get("alt") or "") + " " + unquote(urlparse(str(candidate.get("url") or "")).path)
        available = _tokens(description)
        return len(wanted & available) / max(1, len(wanted))
    return sorted(candidates, key=score, reverse=True)
