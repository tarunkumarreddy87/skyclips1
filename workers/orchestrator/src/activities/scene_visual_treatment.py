"""Per-scene visual treatment — animations, transitions, text overlays.

Avoids one-size-fits-all motion: each section can request a different look
via script JSON `visual_treatment`, with deterministic heuristics as fallback.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

PARALLAX_DIRS = ("left-right", "right-left", "top-bottom", "bottom-top")
MOTION_STYLES = (
    "parallax_pan",
    "ken_burns",
    "zoom_in",
    "float",
    "fade",
    "drop",
    "slide",
)
TRANSITION_STYLES = (
    "zoom",
    "slide-pan",
    "film-burn",
    "glitch",
    "fade",
    "slide",
    "dissolve",
    "cut",
)
TEXT_STYLES = ("none", "chapter_title", "lower_third", "freeform_text")
MOODS = ("hook", "tension", "reveal", "calm", "climax", "outro", "list_item")
MOTION_GRAPHICS = (
    "none",
    "vertical-bar-chart",
    "line-chart",
    "before-after-split",
    "news-highlight",
    "doc-callout",
    "highlight-quote",
)

_HOOK_RE = re.compile(r"\b(hook|intro|open|begin|start|dawn|first)\b", re.I)
_CLIMAX_RE = re.compile(r"\b(climax|final|battle|war|death|collapse|crisis|peak)\b", re.I)
_CALM_RE = re.compile(r"\b(calm|peace|legacy|meaning|reflect|quiet|aftermath)\b", re.I)
_OUTRO_RE = re.compile(r"\b(outro|end|close|conclude|subscribe|thanks)\b", re.I)
_TENSION_RE = re.compile(r"\b(tension|storm|threat|rise|conflict|fear|dark)\b", re.I)


def _seed(*parts: str) -> int:
    digest = hashlib.sha256(":".join(parts).encode()).hexdigest()
    return int(digest[:8], 16)


def _pick(options: tuple[str, ...], *parts: str) -> str:
    return options[_seed(*parts) % len(options)]


def infer_mood(section: dict[str, Any], index: int, total: int) -> str:
    blob = f"{section.get('id', '')} {section.get('title', '')} {section.get('narration', '')[:200]}"
    if index == 0 or _HOOK_RE.search(blob):
        return "hook"
    if index >= max(1, total - 1) or _OUTRO_RE.search(blob):
        return "outro"
    if _CLIMAX_RE.search(blob):
        return "climax"
    if _TENSION_RE.search(blob):
        return "tension"
    if _CALM_RE.search(blob):
        return "calm"
    if total >= 5 and index == total // 2:
        return "reveal"
    return "reveal" if index % 3 == 0 else "tension" if index % 2 == 0 else "calm"


def _default_for_mood(mood: str, *, run_id: str, section_id: str) -> dict[str, str]:
    """Heuristic treatment when the LLM omitted visual_treatment."""
    sid = section_id or "section"
    if mood == "hook":
        return {
            "mood": mood,
            "motion": "parallax_pan",
            "direction": "left-right",
            "transition": "zoom",
            "text_overlay": "none",
            "motion_graphic": "none",
        }
    if mood == "climax":
        return {
            "mood": mood,
            "motion": "zoom_in",
            "direction": "left-right",
            "transition": "film-burn",
            "text_overlay": "chapter_title",
            "motion_graphic": "none",
        }
    if mood == "tension":
        return {
            "mood": mood,
            "motion": "ken_burns",
            "direction": _pick(PARALLAX_DIRS, run_id, sid, "dir"),
            "transition": "glitch",
            "text_overlay": "lower_third" if _seed(run_id, sid) % 2 else "none",
            "motion_graphic": "none",
        }
    if mood == "calm":
        return {
            "mood": mood,
            "motion": "float",
            "direction": "top-bottom",
            "transition": "dissolve",
            "text_overlay": "none",
            "motion_graphic": "none",
        }
    if mood == "outro":
        return {
            "mood": mood,
            "motion": "fade",
            "direction": "right-left",
            "transition": "fade",
            "text_overlay": "none",
            "motion_graphic": "none",
        }
    if mood == "list_item":
        return {
            "mood": mood,
            "motion": _pick(("ken_burns", "parallax_pan", "slide"), run_id, sid),
            "direction": _pick(PARALLAX_DIRS, run_id, sid, "list"),
            "transition": _pick(("slide", "wipeleft", "fade"), run_id, sid, "tr"),
            "text_overlay": "chapter_title",
            "motion_graphic": "none",
        }
    # reveal / default — vary by seed so consecutive scenes differ
    return {
        "mood": mood,
        "motion": _pick(MOTION_STYLES, run_id, sid, "motion"),
        "direction": _pick(PARALLAX_DIRS, run_id, sid, "dir"),
        "transition": _pick(TRANSITION_STYLES, run_id, sid, "tr"),
        "text_overlay": _pick(("none", "chapter_title", "lower_third", "none"), run_id, sid, "text"),
        "motion_graphic": "none",
    }


def normalize_visual_treatment(
    raw: Any,
    *,
    section: dict[str, Any],
    index: int,
    total: int,
    run_id: str,
    format_mode: str = "documentary",
) -> dict[str, str]:
    """Merge LLM visual_treatment with mood heuristics; always return a full dict."""
    section_id = str(section.get("id") or f"section-{index}")
    mood = infer_mood(section, index, total)
    if format_mode == "listicle" and mood not in ("hook", "outro"):
        mood = "list_item"

    base = _default_for_mood(mood, run_id=run_id, section_id=section_id)
    if not isinstance(raw, dict):
        return base

    def _str(key: str, *aliases: str, allowed: tuple[str, ...] | None = None) -> str | None:
        for k in (key, *aliases):
            v = raw.get(k)
            if isinstance(v, str) and v.strip():
                val = v.strip().lower().replace(" ", "_").replace("-", "_")
                # Accept hyphenated transition names
                if allowed and val.replace("_", "-") in allowed:
                    return val.replace("_", "-") if "-" in str(allowed) else val
                if allowed:
                    # try both underscore and hyphen forms
                    for opt in allowed:
                        if opt.replace("-", "_") == val.replace("-", "_"):
                            return opt
                    continue
                return v.strip().lower()
        return None

    motion = _str("motion", "animation", "motion_style", allowed=MOTION_STYLES)
    if motion:
        # normalize underscores for motion ids
        motion = motion.replace("-", "_")
        if motion in MOTION_STYLES:
            base["motion"] = motion

    direction = _str("direction", "pan_direction", "animation_direction", allowed=PARALLAX_DIRS)
    if direction:
        base["direction"] = direction.replace("_", "-") if direction.replace("_", "-") in PARALLAX_DIRS else base["direction"]

    transition = _str("transition", "transition_in", "transition_out", allowed=TRANSITION_STYLES + ("wipeleft", "wiperight", "slideleft", "slideright"))
    if transition:
        base["transition"] = transition.replace("_", "-")

    text = _str("text_overlay", "text", "overlay", allowed=TEXT_STYLES)
    if text:
        text = text.replace("-", "_")
        if text in TEXT_STYLES:
            base["text_overlay"] = text

    llm_mood = _str("mood", allowed=MOODS)
    if llm_mood and llm_mood.replace("-", "_") in MOODS:
        base["mood"] = llm_mood.replace("-", "_")

    mg = _str(
        "motion_graphic",
        "motionGraphic",
        "template",
        "graphic",
        allowed=MOTION_GRAPHICS,
    )
    if mg:
        # Keep hyphenated ids for chart/split templates
        normalized = mg.replace("_", "-")
        if normalized in MOTION_GRAPHICS:
            base["motion_graphic"] = normalized
        elif mg.replace("-", "_") == "none":
            base["motion_graphic"] = "none"

    return base


def animation_for_treatment(treatment: dict[str, str], duration_sec: float) -> dict[str, Any] | None:
    """Map treatment.motion → timeline.v1 elementAnimation."""
    motion = str(treatment.get("motion") or "ken_burns")
    in_dur = min(1.2, max(0.45, duration_sec * 0.22))
    direction = str(treatment.get("direction") or "left-right")
    if direction not in PARALLAX_DIRS:
        direction = "left-right"

    if motion == "parallax_pan":
        return {
            "in": {"preset": "parallax_pan_in", "duration_sec": round(in_dur, 3)},
            "loop": {
                "preset": "parallax_pan",
                "params": {
                    "direction": direction,
                    "scale": 1.2,
                    "foreground_speed": 1.0,
                    "background_speed": 0.45,
                },
            },
        }
    if motion == "ken_burns":
        return {
            "in": {"preset": "ken_burns_in", "duration_sec": round(in_dur, 3)},
            "loop": {"preset": "ken_burns"},
        }
    if motion == "zoom_in":
        return {
            "in": {"preset": "zoom_in", "duration_sec": round(in_dur, 3)},
            "loop": {"preset": "ken_burns"},
        }
    if motion == "float":
        return {
            "in": {"preset": "float", "duration_sec": round(in_dur, 3)},
            "loop": {"preset": "float"},
        }
    if motion == "fade":
        return {
            "in": {"preset": "fade", "duration_sec": round(min(0.8, in_dur), 3)},
            "out": {"preset": "fade", "duration_sec": round(min(0.6, in_dur), 3)},
        }
    if motion == "drop":
        return {
            "in": {"preset": "drop", "duration_sec": round(in_dur, 3)},
            "out": {"preset": "fade", "duration_sec": 0.4},
        }
    if motion == "slide":
        return {
            "in": {"preset": "slide", "duration_sec": round(in_dur, 3)},
            "out": {"preset": "slide", "duration_sec": 0.45},
        }
    return {
        "in": {"preset": "ken_burns_in", "duration_sec": round(in_dur, 3)},
        "loop": {"preset": "ken_burns"},
    }


def broll_animation_for_treatment(treatment: dict[str, str], duration_sec: float) -> dict[str, Any] | None:
    """Slightly different secondary motion so B-roll doesn't mirror A-roll exactly."""
    alt = dict(treatment)
    motion = str(treatment.get("motion") or "")
    if motion == "parallax_pan":
        alt["motion"] = "ken_burns"
    elif motion == "ken_burns":
        alt["motion"] = "parallax_pan"
        # flip direction for depth contrast
        dirs = {"left-right": "right-left", "right-left": "left-right", "top-bottom": "bottom-top", "bottom-top": "top-bottom"}
        alt["direction"] = dirs.get(str(treatment.get("direction")), "right-left")
    elif motion == "zoom_in":
        alt["motion"] = "float"
    else:
        alt["motion"] = "parallax_pan" if motion != "parallax_pan" else "ken_burns"
    return animation_for_treatment(alt, duration_sec)


def build_scene_text_overlay(
    treatment: dict[str, str],
    *,
    section: dict[str, Any],
    clip: dict[str, Any],
    index: int,
) -> dict[str, Any] | None:
    """Optional text overlay driven by scene treatment (not every chapter)."""
    kind = str(treatment.get("text_overlay") or "none")
    if kind == "none":
        return None
    title = str(section.get("title") or "").strip()
    if not title or len(title) < 2:
        return None
    # Skip intro when treatment didn't explicitly ask (hook already returns none usually)
    if index == 0 and kind == "chapter_title":
        return None

    start = float(clip["start_sec"])
    clip_dur = float(clip["duration_sec"])
    dur = min(2.6, max(1.2, clip_dur * 0.22))
    sid = str(section.get("id") or index)

    if kind == "lower_third":
        return {
            "id": f"overlay-lower-{sid}",
            "type": "chapter_title",
            "text": title[:64],
            "start_sec": start + min(0.4, clip_dur * 0.08),
            "duration_sec": dur,
            "transform": {"x": 28, "y": 82, "scaleX": 1, "scaleY": 1, "rotation": 0, "zIndex": 25},
            "animation": {
                "in": {"preset": "slide", "duration_sec": 0.45},
                "out": {"preset": "fade", "duration_sec": 0.35},
            },
        }
    if kind == "freeform_text":
        return {
            "id": f"overlay-text-{sid}",
            "type": "freeform_text",
            "text": title[:72],
            "start_sec": start + 0.25,
            "duration_sec": dur,
            "transform": {"x": 50, "y": 22, "scaleX": 1, "scaleY": 1, "rotation": 0, "zIndex": 24},
            "animation": {
                "in": {"preset": "pop", "duration_sec": 0.4},
                "out": {"preset": "fade", "duration_sec": 0.3},
            },
            "style": {"font_size_px": 52, "font_weight": "700", "alignment": "center", "box_width_pct": 70},
        }
    # chapter_title
    return {
        "id": f"overlay-chapter-{sid}",
        "type": "chapter_title",
        "text": title[:80],
        "start_sec": start,
        "duration_sec": dur,
        "animation": {
            "in": {"preset": "slide", "duration_sec": 0.5},
            "out": {"preset": "fade", "duration_sec": 0.35},
        },
    }
