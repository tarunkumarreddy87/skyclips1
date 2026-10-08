"""Python mirror of the motion-graphics template catalog.

Kept in sync with packages/shared-types/src/motion-templates.ts.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class TemplateCategory(str, Enum):
    INTRO_OUTRO = "intro-outro"
    CINEMATIC_TEXT = "cinematic-text"
    MEDIA_IMAGE = "media-image"
    CHARTS_DATA = "charts-data"
    CONTENT_ANIMATION = "content-animation"


@dataclass(frozen=True)
class TemplateMeta:
    id: str
    label: str
    category: TemplateCategory
    hint: str
    manifest_type: str
    needs_images: bool
    shipped: bool


MOTION_GRAPHIC_MANIFEST_TYPES = frozenset(
    {
        "vertical_bar_chart",
        "line_chart",
        "before_after_split",
        "news_highlight",
        "doc_callout",
        "highlight_quote",
        "product_launch_fullscreen",
    }
)


CATALOG: list[TemplateMeta] = []

BY_ID: dict[str, TemplateMeta] = {t.id: t for t in CATALOG}
BY_LABEL: dict[str, TemplateMeta] = {t.label.lower(): t for t in CATALOG}
MEDIA_TEMPLATE_IDS = [t.id for t in CATALOG if t.needs_images and t.shipped]
SHIPPED_MOTION_GRAPHIC_IDS = [
    t.id for t in CATALOG if t.shipped and t.manifest_type in MOTION_GRAPHIC_MANIFEST_TYPES
]


def get_template(template_id: str) -> TemplateMeta | None:
    return BY_ID.get(template_id)


def get_template_by_label(label: str) -> TemplateMeta | None:
    return BY_LABEL.get(label.strip().lower())


def shipped_motion_graphics() -> list[TemplateMeta]:
    return [t for t in CATALOG if t.shipped and t.manifest_type in MOTION_GRAPHIC_MANIFEST_TYPES]


def default_slots_for_template(template_id: str) -> list[dict]:
    if template_id == "vertical-bar-chart":
        return [
            # No per-bar colours: renderers derive a theme-coherent ramp.
            {"label": "Jan", "value": 42},
            {"label": "Feb", "value": 68},
            {"label": "Mar", "value": 55},
            {"label": "Apr", "value": 88},
            {"label": "May", "value": 72},
        ]
    if template_id == "line-chart":
        return [
            {"label": "W1", "value": 20},
            {"label": "W2", "value": 35},
            {"label": "W3", "value": 28},
            {"label": "W4", "value": 52},
            {"label": "W5", "value": 70},
            {"label": "W6", "value": 64},
        ]
    if template_id == "before-after-split":
        return [{"text": "Before", "label": "Before"}, {"text": "After", "label": "After"}]
    if template_id == "news-highlight":
        return [{"text": "Breaking"}]
    if template_id == "doc-callout":
        return [{"text": "Key fact"}]
    return []


def still_clip_parallax_pan_animation(duration_sec: float) -> dict:
    """Default motion for still A-roll / B-roll — dual-layer parallax pan."""
    in_dur = min(1.2, max(0.45, duration_sec * 0.22))
    return {
        "in": {"preset": "parallax_pan_in", "duration_sec": round(in_dur, 3)},
        "loop": {
            "preset": "parallax_pan",
            "params": {
                "direction": "left-right",
                "scale": 1.2,
                "foreground_speed": 1,
                "background_speed": 0.45,
            },
        },
    }


def still_clip_ken_burns_animation(duration_sec: float) -> dict:
    """Default motion for still A-roll / B-roll — uses existing schema presets."""
    in_dur = min(1.2, max(0.45, duration_sec * 0.22))
    return {
        "in": {"preset": "ken_burns_in", "duration_sec": round(in_dur, 3)},
        "loop": {"preset": "ken_burns"},
    }



