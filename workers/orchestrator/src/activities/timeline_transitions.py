"""Transition placement and sign-off overlay helpers for timeline manifests."""

from __future__ import annotations

import hashlib
import re
from typing import Any

TRANSITION_TYPES = ("zoom", "slide-pan", "film-burn", "glitch")
DEFAULT_TRANSITION_SEC = 0.5
SIGNOFF_RE = re.compile(r"subscribe|thanks for watching|like and follow", re.I)
SFX_THROTTLE_SEC = 3.0


def _rng_seed(*parts: str) -> int:
    digest = hashlib.sha256(":".join(parts).encode()).hexdigest()
    return int(digest[:8], 16)


def assign_transitions(
    video_clips: list[dict[str, Any]],
    *,
    run_id: str,
    transition_types: tuple[str, ...] | list[str] | None = None,
    per_boundary_types: list[str | None] | None = None,
    density: float = 0.55,
) -> list[dict[str, Any]]:
    """Place transitions on scene boundaries.

    When ``per_boundary_types`` is provided (length n-1), those types drive
    placement (``cut`` / empty skips). Otherwise ~density of boundaries get a
    cycling type, weighted toward hook/outro.
    """
    n = len(video_clips)
    if n < 2:
        return []

    type_cycle = tuple(transition_types) if transition_types else TRANSITION_TYPES
    if not type_cycle:
        type_cycle = TRANSITION_TYPES

    boundary_count = n - 1
    transitions: list[dict[str, Any]] = []
    last_sfx_at = -999.0

    if per_boundary_types is not None and len(per_boundary_types) >= boundary_count:
        for boundary in range(boundary_count):
            raw = per_boundary_types[boundary]
            t_type = str(raw or "cut").strip().lower().replace("_", "-")
            if not t_type or t_type == "cut":
                continue
            after_clip = video_clips[boundary]
            start_sec = float(after_clip["start_sec"]) + float(after_clip["duration_sec"])
            sfx_muted = (start_sec - last_sfx_at) < SFX_THROTTLE_SEC
            if not sfx_muted:
                last_sfx_at = start_sec
            transitions.append(
                {
                    "id": f"tr-{boundary}",
                    "after_clip_id": after_clip["id"],
                    "type": t_type,
                    "duration_sec": DEFAULT_TRANSITION_SEC,
                    "enabled": True,
                    "sfx_muted": sfx_muted,
                }
            )
        return transitions

    target = max(1, round(boundary_count * max(0.2, min(0.9, density))))
    weights = [1.0] * boundary_count
    for idx in (0, 1, boundary_count - 2, boundary_count - 1):
        if 0 <= idx < boundary_count:
            weights[idx] = 3.0

    _ = _rng_seed(run_id, "transitions")
    order = list(range(boundary_count))
    # Deterministic shuffle among equal-weight boundaries.
    order.sort(key=lambda i: (weights[i], _rng_seed(run_id, str(i)) % 1000), reverse=True)
    selected = sorted(order[:target])

    for pick_idx, boundary in enumerate(selected):
        after_clip = video_clips[boundary]
        start_sec = float(after_clip["start_sec"]) + float(after_clip["duration_sec"])
        # Vary type by boundary seed so consecutive videos don't feel identical.
        t_type = type_cycle[(pick_idx + _rng_seed(run_id, f"tr-{boundary}")) % len(type_cycle)]
        sfx_muted = (start_sec - last_sfx_at) < SFX_THROTTLE_SEC
        if not sfx_muted:
            last_sfx_at = start_sec
        transitions.append(
            {
                "id": f"tr-{boundary}",
                "after_clip_id": after_clip["id"],
                "type": t_type,
                "duration_sec": DEFAULT_TRANSITION_SEC,
                "enabled": True,
                "sfx_muted": sfx_muted,
            }
        )
    return transitions


def detect_subscribe_overlay(
    section_narrations: list[str],
    total_duration: float,
) -> dict[str, Any] | None:
    """At generation time only: persist a subscribe_cta into timeline.v1 overlays[].

    This writes into the SSOT timeline artifact (not a load-time editor invent).
    The editor maps overlays[] only — it must not re-infer CTAs from captions.
    """
    if not section_narrations:
        return None
    last = (section_narrations[-1] or "").strip()
    if not last or not SIGNOFF_RE.search(last):
        return None
    duration = min(6.0, max(3.0, total_duration * 0.05))
    start = max(0.0, total_duration - duration - 0.5)
    return {
        "id": "overlay-subscribe-cta",
        "type": "subscribe_cta",
        "text": "Subscribe",
        "start_sec": start,
        "duration_sec": duration,
    }


CHAPTER_TITLE_SEC = 2.4


def build_chapter_title_overlays(
    sections: list[dict[str, Any]],
    video_clips: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Template chapter titles at section starts (skip intro / untitled)."""
    by_section: dict[str, dict[str, Any]] = {}
    for clip in video_clips:
        scene_id = str(clip.get("scene_id") or clip.get("id") or "")
        section_id = scene_id.removeprefix("scene-") if scene_id.startswith("scene-") else scene_id
        by_section[section_id] = clip

    overlays: list[dict[str, Any]] = []
    for idx, section in enumerate(sections):
        if idx == 0:
            continue  # Intro stays clean; titles mark later chapters
        title = str(section.get("title") or "").strip()
        if not title or len(title) < 2:
            continue
        sid = str(section.get("id") or "")
        clip = by_section.get(sid)
        if not clip:
            continue
        start = float(clip["start_sec"])
        dur = min(CHAPTER_TITLE_SEC, max(1.2, float(clip["duration_sec"]) * 0.25))
        overlays.append(
            {
                "id": f"overlay-chapter-{sid}",
                "type": "chapter_title",
                "text": title[:80],
                "start_sec": start,
                "duration_sec": dur,
            }
        )
    return overlays
