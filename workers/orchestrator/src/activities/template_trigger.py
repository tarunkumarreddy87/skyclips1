"""Hybrid motion-graphic template auto-trigger for timeline overlays.

LLM `visual_treatment.motion_graphic` is preferred per scene; heuristics fill
gaps. Graphics are timed mid-scene and biased toward mid-video scenes.
Respects brand allow/deny + theme.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from shared_types.motion_templates import (
    MOTION_GRAPHIC_MANIFEST_TYPES,
    SHIPPED_MOTION_GRAPHIC_IDS,
    default_slots_for_template,
    get_template,
    get_template_by_label,
    shipped_motion_graphics,
)

logger = logging.getLogger(__name__)

_COMPARE_RE = re.compile(
    r"\b(before|after|versus|vs\.?|compared?|contrast|then\s+and\s+now)\b",
    re.I,
)
_STATS_RE = re.compile(
    r"\b(\d+(\.\d+)?%|statistics?|growth|revenue|metrics?|chart|data|numbers?|monthly|performance)\b",
    re.I,
)
_NEWS_RE = re.compile(
    r"\b(breaking|headline|news|reported|announced|today|press)\b",
    re.I,
)
_HISTORY_RE = re.compile(
    r"\b(history|historical|century|ancient|archive|document|map|located|region)\b",
    re.I,
)
_QUOTE_RE = re.compile(r'[“"]([^”"]{12,160})[”"]')


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _resolve_allowed_ids(ctx: dict[str, Any]) -> set[str]:
    """Resolve brand allow/deny into a set of template ids."""
    shipped = set(SHIPPED_MOTION_GRAPHIC_IDS)
    mode = str(ctx.get("template_mode") or "auto").strip().lower()
    blocked_raw = [str(x) for x in (ctx.get("blocklisted_templates") or []) if x]
    allowed_raw = [str(x) for x in (ctx.get("allowed_templates") or []) if x]

    def to_id(token: str) -> str | None:
        t = get_template(token) or get_template_by_label(token)
        if t and t.id in shipped:
            return t.id
        alt = token.strip().lower().replace("_", "-")
        t2 = get_template(alt)
        if t2 and t2.id in shipped:
            return t2.id
        return None

    blocked = {tid for tok in blocked_raw if (tid := to_id(tok))}
    if mode == "manual":
        allowed = {tid for tok in allowed_raw if (tid := to_id(tok))}
        if not allowed:
            return set()
        return allowed - blocked
    return shipped - blocked


def _scene_text(section: dict[str, Any], treatment: dict[str, Any] | None = None) -> str:
    parts = [
        str(section.get("title") or ""),
        str(section.get("narration") or section.get("script") or ""),
        str(section.get("summary") or ""),
    ]
    if treatment:
        parts.append(str(treatment.get("text_overlay") or ""))
        parts.append(str(treatment.get("motion_graphic") or ""))
    return " ".join(p for p in parts if p)


def _llm_pick(treatment: dict[str, Any] | None) -> str | None:
    if not isinstance(treatment, dict):
        return None
    raw = treatment.get("motion_graphic") or treatment.get("motionGraphic")
    if not isinstance(raw, str):
        return None
    tid = raw.strip().lower().replace("_", "-")
    if not tid or tid == "none":
        return None
    if tid in SHIPPED_MOTION_GRAPHIC_IDS:
        return tid
    return None


def _heuristic_pick(text: str, theme_id: str) -> str | None:
    if _COMPARE_RE.search(text):
        return "before-after-split"
    if _STATS_RE.search(text):
        if re.search(r"\b(trend|over time|growth|weeks?|months?)\b", text, re.I):
            return "line-chart"
        return "vertical-bar-chart"
    if _NEWS_RE.search(text):
        return "news-highlight"
    if _HISTORY_RE.search(text) or theme_id in ("history", "crime"):
        return "doc-callout"
    m = _QUOTE_RE.search(text)
    if m:
        return "highlight-quote"
    return None


def _is_mid_video_scene(index: int, total: int) -> bool:
    """Prefer scenes in the middle band of the video (skip open/close)."""
    if total <= 2:
        return index == 0
    if total <= 4:
        return 0 < index < total - 1
    # Skip first and last ~20% of scenes
    lo = max(1, int(total * 0.15))
    hi = min(total - 2, int(total * 0.85))
    return lo <= index <= hi


def _build_overlay(
    template_id: str,
    *,
    clip: dict[str, Any],
    section: dict[str, Any],
    index: int,
    theme_id: str,
) -> dict[str, Any] | None:
    meta = get_template(template_id)
    if not meta or meta.manifest_type not in MOTION_GRAPHIC_MANIFEST_TYPES:
        return None
    start = float(clip.get("start_sec") or 0)
    clip_dur = max(1.0, float(clip.get("duration_sec") or 5))
    # Mid-scene: start ~40% in, hold ~45% of clip (clamped).
    dur = max(3.5, min(7.0, clip_dur * 0.45))
    mid = start + max(0.5, clip_dur * 0.40)
    # Keep overlay inside the clip window
    if mid + dur > start + clip_dur:
        mid = max(start + 0.35, start + clip_dur - dur)
    title = str(section.get("title") or meta.label).strip() or meta.label
    narration = str(section.get("narration") or section.get("script") or "").strip()
    subtitle = narration[:140] if narration else None
    quote_m = _QUOTE_RE.search(narration)
    if template_id == "highlight-quote" and quote_m:
        title = quote_m.group(1).strip()
    image_refs: list[str] = []
    src = clip.get("src")
    if src and meta.needs_images:
        image_refs.append(str(src))
    return {
        "id": f"mg-{meta.manifest_type}-{index}",
        "type": meta.manifest_type,
        "text": title,
        "title": title,
        "subtitle": subtitle,
        "slots": default_slots_for_template(template_id),
        "image_refs": image_refs,
        "theme_id": theme_id
        if theme_id in ("crime", "history", "modern", "minimalist", "standard")
        else "standard",
        "start_sec": round(mid, 3),
        "duration_sec": round(dur, 3),
        "transform": {"x": 50, "y": 48, "scaleX": 1, "scaleY": 1, "rotation": 0, "zIndex": 25},
        "animation": {"in": {"preset": "fade", "duration_sec": 0.4}},
        "style": {"box_width_pct": 72},
    }


def auto_trigger_templates(
    *,
    sections: list[dict[str, Any]],
    video_clips: list[dict[str, Any]],
    theme_id: str,
    treatments: list[dict[str, Any]] | None,
    ctx: dict[str, Any],
    max_overlays: int = 5,
) -> list[dict[str, Any]]:
    """Return motion-graphic overlays to merge into the timeline manifest."""
    if ctx.get("disable_overlays") or ctx.get("disable_animations"):
        return []
    allowed = _resolve_allowed_ids(ctx)
    if not allowed:
        return []

    sections_by_id = {str(s.get("id") or ""): s for s in sections if isinstance(s, dict)}
    out: list[dict[str, Any]] = []
    used_templates: set[str] = set()
    total = len(video_clips)
    ambiguous: list[tuple[int, dict, dict]] = []

    for idx, clip in enumerate(video_clips):
        if clip.get("motion_template"):
            continue
        if len(out) >= max_overlays:
            break
        scene_id = str(clip.get("scene_id") or "")
        section_id = scene_id.removeprefix("scene-") if scene_id.startswith("scene-") else scene_id
        section = sections_by_id.get(section_id) or {}
        treatment = treatments[idx] if treatments and idx < len(treatments) else {}
        if not isinstance(treatment, dict):
            treatment = {}

        # 1) Prefer LLM scene pick
        pick = _llm_pick(treatment)
        # 2) Heuristic from narration when LLM said none / omitted
        if not pick:
            text = _scene_text(section, treatment)
            pick = _heuristic_pick(text, theme_id)

        if pick and pick in allowed:
            # Allow reuse only after catalog is exhausted; prefer unique first
            if pick in used_templates and len(used_templates) < len(allowed):
                ambiguous.append((idx, clip, section))
                continue
            # Soft-bias: skip open/close unless LLM explicitly requested this scene
            if not _llm_pick(treatment) and not _is_mid_video_scene(idx, total) and total > 3:
                ambiguous.append((idx, clip, section))
                continue
            overlay = _build_overlay(
                pick, clip=clip, section=section, index=idx, theme_id=theme_id
            )
            if overlay:
                out.append(overlay)
                used_templates.add(pick)
            continue

        if not pick:
            ambiguous.append((idx, clip, section))

    # Fill mid-video gaps so short videos still get at least 1–2 graphics
    if len(out) < min(2, max_overlays) and ambiguous:
        theme_default = {
            "crime": "news-highlight",
            "history": "doc-callout",
            "modern": "vertical-bar-chart",
            "minimalist": "highlight-quote",
            "standard": "highlight-quote",
        }.get(theme_id, "highlight-quote")
        # Prefer mid-video ambiguous scenes first
        ambiguous.sort(key=lambda row: (0 if _is_mid_video_scene(row[0], total) else 1, row[0]))
        for idx, clip, section in ambiguous:
            if len(out) >= min(2, max_overlays):
                break
            pick = theme_default if theme_default in allowed else next(iter(sorted(allowed)), None)
            if not pick or pick in used_templates:
                pick = next((t for t in sorted(allowed) if t not in used_templates), None)
            if not pick:
                break
            overlay = _build_overlay(
                pick, clip=clip, section=section, index=idx, theme_id=theme_id
            )
            if overlay:
                out.append(overlay)
                used_templates.add(pick)

    logger.info(
        "template_trigger: added %s overlays (allowed=%s theme=%s)",
        len(out),
        sorted(allowed),
        theme_id,
    )
    return out


def catalog_hint_for_prompt() -> str:
    lines = [f"- {t.id}: {t.hint}" for t in shipped_motion_graphics()]
    return "\n".join(lines)
