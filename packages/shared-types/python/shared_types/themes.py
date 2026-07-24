"""Video visual themes — one per project, applied across overlays/grade/transitions."""

from __future__ import annotations

import re
from typing import Any, Literal

ThemeId = Literal["crime", "history", "modern", "minimalist", "standard"]

THEME_PRESETS: dict[str, dict[str, Any]] = {
    "crime": {
        "id": "crime",
        "name": "Crime",
        "description": "Dark, dramatic — true crime and investigative stories",
        "palette": {
            "primary": "0x7F1D1D",
            "accent": "0xEF4444",
            "text": "white",
            "chapter_box": "black@0.72",
            "caption_primary": "0xFCA5A5",
        },
        "font_scale": 1.05,
        "cta_fontsize": 42,
        "chapter_fontsize": 56,
        "transition_preference": ["glitch", "film-burn", "zoom", "slide-pan"],
        "visual_grade": {
            "intensity": 0.85,
            "eq": "contrast=1.18:brightness=-0.06:saturation=0.78",
        },
        "chart": {
            "bar_color": "0xEF4444",
            "line_color": "0xFCA5A5",
            "pie_colors": ["0x7F1D1D", "0xEF4444", "0xFCA5A5", "0x450A0A"],
        },
    },
    "history": {
        "id": "history",
        "name": "History",
        "description": "Timeless, classic — documentary and archival tone",
        "palette": {
            "primary": "0x92400E",
            "accent": "0xD97706",
            "text": "0xFEF3C7",
            "chapter_box": "0x1C1917@0.62",
            "caption_primary": "0xFDE68A",
        },
        "font_scale": 1.0,
        "cta_fontsize": 38,
        "chapter_fontsize": 50,
        "transition_preference": ["film-burn", "zoom", "slide-pan", "glitch"],
        "visual_grade": {
            "intensity": 0.7,
            "eq": "contrast=1.08:brightness=-0.02:saturation=0.72",
        },
        "chart": {
            "bar_color": "0xD97706",
            "line_color": "0xF59E0B",
            "pie_colors": ["0x92400E", "0xD97706", "0xFDE68A", "0x78350F"],
        },
    },
    "modern": {
        "id": "modern",
        "name": "Modern",
        "description": "Sleek, vibrant — tech, news, and explainers",
        "palette": {
            "primary": "0x0369A1",
            "accent": "0x0EA5E9",
            "text": "white",
            "chapter_box": "0x0C4A6E@0.55",
            "caption_primary": "0x7DD3FC",
        },
        "font_scale": 1.0,
        "cta_fontsize": 40,
        "chapter_fontsize": 52,
        "transition_preference": ["zoom", "slide-pan", "glitch", "film-burn"],
        "visual_grade": {
            "intensity": 0.55,
            "eq": "contrast=1.1:brightness=0.02:saturation=1.15",
        },
        "chart": {
            "bar_color": "0x0EA5E9",
            "line_color": "0x38BDF8",
            "pie_colors": ["0x0369A1", "0x0EA5E9", "0x7DD3FC", "0x075985"],
        },
    },
    "minimalist": {
        "id": "minimalist",
        "name": "Minimalist",
        "description": "Clean, subtle — understated overlays and soft grade",
        "palette": {
            "primary": "0x3F3F46",
            "accent": "0xA1A1AA",
            "text": "white",
            "chapter_box": "black@0.35",
            "caption_primary": "0xE4E4E7",
        },
        "font_scale": 0.92,
        "cta_fontsize": 34,
        "chapter_fontsize": 44,
        "transition_preference": ["slide-pan", "zoom", "film-burn", "glitch"],
        "visual_grade": {
            "intensity": 0.25,
            "eq": "contrast=1.02:brightness=0.01:saturation=0.92",
        },
        "chart": {
            "bar_color": "0x71717A",
            "line_color": "0xA1A1AA",
            "pie_colors": ["0x3F3F46", "0x71717A", "0xA1A1AA", "0x27272A"],
        },
    },
    "standard": {
        "id": "standard",
        "name": "Standard",
        "description": "Neutral, adaptable — default brand look",
        "palette": {
            "primary": "0xE11D48",
            "accent": "0xFB7185",
            "text": "white",
            "chapter_box": "black@0.45",
            "caption_primary": "0xFFFFFF",
        },
        "font_scale": 1.0,
        "cta_fontsize": 40,
        "chapter_fontsize": 52,
        "transition_preference": ["zoom", "slide-pan", "film-burn", "glitch"],
        "visual_grade": {
            "intensity": 0.0,
            "eq": "contrast=1:brightness=0:saturation=1",
        },
        "chart": {
            "bar_color": "0xE11D48",
            "line_color": "0xFB7185",
            "pie_colors": ["0xE11D48", "0xFB7185", "0xFDA4AF", "0x9F1239"],
        },
    },
}

_ALIASES: dict[str, ThemeId] = {
    "standard": "standard",
    "crime": "crime",
    "history": "history",
    "modern": "modern",
    "minimalist": "minimalist",
    "bp-1": "standard",
    "bp-2": "modern",
    "bp-3": "history",
    "theme-crime": "crime",
    "theme-history": "history",
    "theme-modern": "modern",
    "theme-minimalist": "minimalist",
    "theme-standard": "standard",
}


def resolve_theme_id(brand_profile_id: str | None) -> ThemeId:
    raw = (brand_profile_id or "standard").strip().lower()
    return _ALIASES.get(raw, "standard")


def get_theme(brand_profile_id: str | None) -> dict[str, Any]:
    return THEME_PRESETS[resolve_theme_id(brand_profile_id)]


_INFER_RULES: list[tuple[ThemeId, list[re.Pattern[str]]]] = [
    (
        "crime",
        [
            re.compile(r"\btrue crime\b", re.I),
            re.compile(r"\bmurder\b", re.I),
            re.compile(r"\bserial killer\b", re.I),
            re.compile(r"\binvestigat", re.I),
            re.compile(r"\bforensic\b", re.I),
            re.compile(r"\bcrime scene\b", re.I),
            re.compile(r"\bhomicide\b", re.I),
        ],
    ),
    (
        "history",
        [
            re.compile(r"\bhistor", re.I),
            re.compile(r"\bancient\b", re.I),
            re.compile(r"\bempire\b", re.I),
            re.compile(r"\bwwii\b|\bworld war\b", re.I),
            re.compile(r"\bmedieval\b", re.I),
            re.compile(r"\barchaeolog", re.I),
        ],
    ),
    (
        "modern",
        [
            re.compile(r"\btech\b", re.I),
            re.compile(r"\bai\b|\bartificial intelligence\b", re.I),
            re.compile(r"\bstartup\b", re.I),
            re.compile(r"\bsmartphone\b", re.I),
            re.compile(r"\binternet\b", re.I),
            re.compile(r"\bsocial media\b", re.I),
            re.compile(r"\bfuture of\b", re.I),
        ],
    ),
    (
        "minimalist",
        [
            re.compile(r"\bminimal\b", re.I),
            re.compile(r"\bclean design\b", re.I),
            re.compile(r"\bcalm\b", re.I),
        ],
    ),
]


def infer_theme_from_text(text: str) -> ThemeId:
    blob = text or ""
    for theme_id, patterns in _INFER_RULES:
        if any(p.search(blob) for p in patterns):
            return theme_id
    return "standard"
