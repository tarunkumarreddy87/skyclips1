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


CATALOG: list[TemplateMeta] = [
    TemplateMeta(
        "subscribe-cta",
        "Subscribe CTA",
        TemplateCategory.CONTENT_ANIMATION,
        "End-screen subscribe badge with pulse animation",
        "subscribe_cta",
        False,
        True,
    ),
    TemplateMeta(
        "chapter-title",
        "Chapter title",
        TemplateCategory.CINEMATIC_TEXT,
        "Section header overlay, slides in from the left",
        "chapter_title",
        False,
        True,
    ),
    TemplateMeta(
        "lower-third",
        "Lower third",
        TemplateCategory.CINEMATIC_TEXT,
        "Broadcast-style name and title strip at the bottom",
        "chapter_title",
        False,
        True,
    ),
    TemplateMeta(
        "ken-burns-reveal",
        "Ken Burns reveal",
        TemplateCategory.MEDIA_IMAGE,
        "Slow zoom focus-pull on a hero still (clip animation)",
        "ken_burns_reveal",
        True,
        True,
    ),
    TemplateMeta(
        "parallax-pan",
        "Parallax pan",
        TemplateCategory.MEDIA_IMAGE,
        "Foreground and background layers pan at different speeds for cinematic depth",
        "parallax_pan",
        True,
        True,
    ),
    TemplateMeta(
        "photo-stack",
        "Photo stack",
        TemplateCategory.MEDIA_IMAGE,
        "Stacked photo reveal with slight rotation offsets",
        "photo_stack",
        True,
        False,
    ),
    TemplateMeta(
        "polaroid-frame",
        "Polaroid frame",
        TemplateCategory.MEDIA_IMAGE,
        "Polaroid-style photo frame with drop-in animation",
        "polaroid_frame",
        True,
        False,
    ),
    TemplateMeta(
        "image-carousel",
        "Image carousel",
        TemplateCategory.MEDIA_IMAGE,
        "Horizontal sliding image carousel with centre focus",
        "image_carousel",
        True,
        False,
    ),
    TemplateMeta(
        "split-screen",
        "Split screen",
        TemplateCategory.MEDIA_IMAGE,
        "Two-panel split screen for comparisons and dual content",
        "split_screen",
        True,
        False,
    ),
    TemplateMeta(
        "picture-in-picture",
        "Picture in picture",
        TemplateCategory.MEDIA_IMAGE,
        "PiP overlay layout for tutorials and video calls",
        "picture_in_picture",
        True,
        False,
    ),
]

BY_ID: dict[str, TemplateMeta] = {t.id: t for t in CATALOG}
MEDIA_TEMPLATE_IDS = [t.id for t in CATALOG if t.needs_images and t.shipped]


def get_template(template_id: str) -> TemplateMeta | None:
    return BY_ID.get(template_id)


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
