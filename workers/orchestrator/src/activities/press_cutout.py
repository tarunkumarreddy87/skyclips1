"""Opt-in Press Cutout placement using only the documentary's own scene content."""
from __future__ import annotations

import math
import re
from urllib.parse import urlparse

TEMPLATE_ID = "press-cutout-v1"
INSERT_DURATION = 10.0
SOUND_CUES = (
    (0.12, "press-paper", 0.40), (0.45, "press-impact", 0.32),
    (1.25, "press-marker", 0.34), (2.0, "press-whoosh", 0.34),
    (3.4, "press-pencil", 0.30), (6.0, "press-rise", 0.24),
    (9.4, "press-exit", 0.30),
)


def enabled(ctx: dict) -> bool:
    from src.pipeline.motion_policy import approved_templates, builtin_enabled, motion_mode
    if motion_mode(ctx) == "none":
        return False
    return bool(approved_templates(ctx) or ctx.get("agent_generated_templates") or builtin_enabled(ctx))


def _plain(value: object, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[:limit - 1].rsplit(" ", 1)[0].rstrip(".,;:") + "…"


def select_sections(sections: list[dict], ctx: dict) -> set[str]:
    """Choose up to three strong beats, with at least a minute between inserts."""
    if not enabled(ctx):
        return set()
    candidates = []
    start = 0.0
    for section in sections:
        duration = max(0.0, float(section.get("actual_duration_sec") or 5.0))
        title = _plain(section.get("title"), 120)
        narration = _plain(section.get("narration"), 500)
        treatment = section.get("visual_treatment") or {}
        if not isinstance(treatment, dict):
            treatment = {}
        if duration >= 4.0 and title and narration and section.get("id"):
            score = (3 if treatment.get("media_role") in {"person", "object"} else 0)
            score += (2 if treatment.get("mood") in {"hook", "reveal", "climax"} else 0)
            candidates.append((start, score, str(section["id"])))
        start += duration
    limit = min(3, max(1, math.floor(start / 60)))
    selected: set[str] = set()
    earliest = 0.0
    while len(selected) < limit:
        remaining = [c for c in candidates if c[0] >= earliest]
        if not remaining:
            break
        window_start = remaining[0][0]
        window = [c for c in remaining if c[0] < window_start + 60]
        chosen = max(window, key=lambda c: (c[1], -c[0]))
        selected.add(chosen[2])
        earliest = chosen[0] + 60
    return selected


def make_template(section: dict, asset_ref: dict, duration: float, ctx: dict) -> dict:
    """Trusted template id selects code in the renderer; prose never becomes code."""
    title = _plain(section.get("title"), 110)
    narration = _plain(section.get("narration"), 190)
    source_url = str(asset_ref.get("source_url") or "")
    source = urlparse(source_url).hostname or ""
    if not source:
        source = str(asset_ref.get("provider") or asset_ref.get("license") or "")
    # A date is shown only when it is actually part of this scene's narration.
    year = re.search(r"(?<!\d)(?:1[0-9]{3}|20[0-9]{2})(?!\d)", str(section.get("narration") or ""))
    prefs = ctx.get("motion_graphics") or {}
    cues = [{"at": round(at * duration / INSERT_DURATION, 4), "sound": sound, "gain": gain}
            for at, sound, gain in SOUND_CUES] if prefs.get("soundEnabled", True) else []
    return {
        "id": "editorial-newspaper", "title": title, "subtitle": narration,
        "eyebrow": year.group(0) if year else "",
        "source_label": _plain(source, 85),
        "highlight": _plain(" ".join(title.split()[-2:]), 80),
        "motion_intensity": prefs.get("intensity", "cinematic"),
        "html_template": {
            "id": TEMPLATE_ID, "profileId": str(ctx.get("brand_profile_id") or "standard"),
            "name": "Press Cutout", "description": "A dimensional documentary press collage.",
            "tags": ["documentary", "press", "cutout"], "html": "<div data-template=\"press-cutout-v1\"></div>", "css": "", "js": "",
            "durationSec": duration, "aiEnabled": True,
            "assets": [{"key": "subject", "kind": "image", "url": asset_ref["s3_key"], "required": True}],
            "audioCues": cues,
        },
    }


def insert_templates(clips: list[dict], broll: list[dict], treatments: list[dict],
                     scenes: list[dict], sections: dict[str, dict], ctx: dict
                     ) -> tuple[list[dict], list[dict], list[dict]]:
    """Split selected openings after captions are timed, preserving the overall clock."""
    if not enabled(ctx):
        return clips, broll, treatments
    scene_map = {str(s.get("id")): s for s in scenes}
    result, result_treatments, occupied = [], [], []
    last_start = -60.0
    for index, clip in enumerate(clips):
        treatment = treatments[index] if index < len(treatments) else {}
        scene = scene_map.get(str(clip.get("scene_id"))) or {}
        section = sections.get(str(scene.get("section_id"))) or {}
        start = float(clip["start_sec"])
        duration = float(clip["duration_sec"])
        source = str((scene.get("asset_ref") or {}).get("s3_key") or "")
        custom = scene.get("selected_uploaded_template")
        selected = (scene.get("motion_graphics_template") and section
                    and (custom or source.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
                    and duration >= 4 and start >= last_start + 60 and len(occupied) < 3)
        if not selected:
            result.append(clip)
            result_treatments.append(treatment)
            continue
        insert_duration = min(float(custom["durationSec"]) if custom else INSERT_DURATION, duration)
        # Avoid a visually distracting fractional remnant at the end of a scene.
        if 0 < duration - insert_duration < 0.5:
            insert_duration = duration
        insert = {**clip, "id": f"{clip['id']}-press", "type": "image", "duration_sec": insert_duration}
        insert["motion_template"] = make_template(section, scene["asset_ref"], insert_duration, ctx)
        if custom:
            import copy
            template = copy.deepcopy(custom)
            template["durationSec"] = insert_duration
            template["audioCues"] = [{**c, "at": c["at"] * insert_duration / float(custom["durationSec"])} for c in custom.get("audioCues", [])]
            insert["motion_template"]["html_template"] = template
            insert["motion_template"]["layer_edits"] = {k:{"text":v} for k,v in scene.get("template_bindings", {}).items()}
        insert.pop("animation", None)
        insert.pop("visual_treatment", None)
        result.append(insert)
        result_treatments.append({**treatment, "transition": "cut"} if insert_duration < duration else treatment)
        if insert_duration < duration:
            result.append({**clip, "start_sec": start + insert_duration, "duration_sec": duration - insert_duration})
            result_treatments.append(treatment)
        occupied.append((start, start + insert_duration))
        last_start = start
    # Optional B-roll must not cover the template. Preserve any visible remainder.
    filtered_broll = []
    for clip in broll:
        begin, finish = float(clip["start_sec"]), float(clip["start_sec"]) + float(clip["duration_sec"])
        spans = [(begin, finish)]
        for a, b in occupied:
            spans = [(x, min(y, a)) for x, y in spans if x < a] + [(max(x, b), y) for x, y in spans if y > b]
        for index, (a, b) in enumerate(sorted(spans)):
            if b - a >= 0.25:
                filtered_broll.append({**clip, "id": f"{clip['id']}-part-{index}", "start_sec": a, "duration_sec": b - a})
    return result, filtered_broll, result_treatments
