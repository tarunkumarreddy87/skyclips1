"""Theme lookup for media worker — prefers shared_types, falls back to local presets."""

from __future__ import annotations

from typing import Any

try:
    from shared_types.themes import THEME_PRESETS, get_theme, resolve_theme_id
except ImportError:  # pragma: no cover - editable install missing in ad-hoc scripts
    THEME_PRESETS = {
        "crime": {
            "id": "crime",
            "palette": {
                "primary": "0x7F1D1D",
                "text": "white",
                "chapter_box": "black@0.72",
                "caption_primary": "0xFCA5A5",
            },
            "font_scale": 1.05,
            "cta_fontsize": 42,
            "chapter_fontsize": 56,
            "visual_grade": {
                "intensity": 0.85,
                "eq": "contrast=1.18:brightness=-0.06:saturation=0.78",
            },
        },
        "modern": {
            "id": "modern",
            "palette": {
                "primary": "0x0369A1",
                "text": "white",
                "chapter_box": "0x0C4A6E@0.55",
                "caption_primary": "0x7DD3FC",
            },
            "font_scale": 1.0,
            "cta_fontsize": 40,
            "chapter_fontsize": 52,
            "visual_grade": {
                "intensity": 0.55,
                "eq": "contrast=1.1:brightness=0.02:saturation=1.15",
            },
        },
        "history": {
            "id": "history",
            "palette": {
                "primary": "0x92400E",
                "text": "0xFEF3C7",
                "chapter_box": "0x1C1917@0.62",
                "caption_primary": "0xFDE68A",
            },
            "font_scale": 1.0,
            "cta_fontsize": 38,
            "chapter_fontsize": 50,
            "visual_grade": {
                "intensity": 0.7,
                "eq": "contrast=1.08:brightness=-0.02:saturation=0.72",
            },
        },
        "minimalist": {
            "id": "minimalist",
            "palette": {
                "primary": "0x3F3F46",
                "text": "white",
                "chapter_box": "black@0.35",
                "caption_primary": "0xE4E4E7",
            },
            "font_scale": 0.92,
            "cta_fontsize": 34,
            "chapter_fontsize": 44,
            "visual_grade": {
                "intensity": 0.25,
                "eq": "contrast=1.02:brightness=0.01:saturation=0.92",
            },
        },
        "standard": {
            "id": "standard",
            "palette": {
                "primary": "0xE11D48",
                "text": "white",
                "chapter_box": "black@0.45",
                "caption_primary": "0xFFFFFF",
            },
            "font_scale": 1.0,
            "cta_fontsize": 40,
            "chapter_fontsize": 52,
            "visual_grade": {"intensity": 0.0, "eq": "contrast=1:brightness=0:saturation=1"},
        },
    }

    def resolve_theme_id(brand_profile_id: str | None) -> str:
        raw = (brand_profile_id or "standard").strip().lower()
        aliases = {
            "bp-1": "standard",
            "bp-2": "modern",
            "bp-3": "history",
            "theme-crime": "crime",
            "theme-history": "history",
            "theme-modern": "modern",
            "theme-minimalist": "minimalist",
            "theme-standard": "standard",
        }
        key = aliases.get(raw, raw)
        return key if key in THEME_PRESETS else "standard"

    def get_theme(brand_profile_id: str | None) -> dict[str, Any]:
        return THEME_PRESETS[resolve_theme_id(brand_profile_id)]


__all__ = ["THEME_PRESETS", "get_theme", "resolve_theme_id"]
