"""Assign ~30% of clip boundaries to transitions, weighted toward hook/outro."""

from __future__ import annotations

import hashlib
import random
from typing import Any

TRANSITION_TYPES = ("zoom", "slide-pan", "film-burn", "glitch")
DEFAULT_TRANSITION_SEC = 0.5
SFX_THROTTLE_SEC = 3.0


def _boundary_weights(count: int) -> list[float]:
    weights = [1.0] * count
    for idx in (0, 1, count - 2, count - 1):
        if 0 <= idx < count:
            weights[idx] = 3.5
    return weights


def assign_transitions(
    video_clips: list[dict[str, Any]],
    *,
    run_id: str,
    transition_ratio: float = 0.3,
) -> list[dict[str, Any]]:
    """Return transition specs for ~30% of boundaries (70% hard cuts)."""
    if len(video_clips) < 2:
        return []

    boundary_count = len(video_clips) - 1
    target = max(1, round(boundary_count * transition_ratio))
    weights = _boundary_weights(boundary_count)
    seed = int(hashlib.sha256(run_id.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    indices = list(range(boundary_count))
    chosen: list[int] = []
    pool = indices[:]
    pool_weights = weights[:]
    for _ in range(min(target, boundary_count)):
        total = sum(pool_weights)
        pick = rng.uniform(0, total)
        acc = 0.0
        for idx, w in zip(pool, pool_weights):
            acc += w
            if pick <= acc:
                chosen.append(idx)
                remove_at = pool.index(idx)
                pool.pop(remove_at)
                pool_weights.pop(remove_at)
                break

    chosen.sort()
    transitions: list[dict[str, Any]] = []
    last_sfx_at = -999.0
    for i, boundary_idx in enumerate(chosen):
        after_clip = video_clips[boundary_idx]
        start_sec = float(after_clip["start_sec"]) + float(after_clip["duration_sec"])
        t_type = TRANSITION_TYPES[i % len(TRANSITION_TYPES)]
        sfx_muted = (start_sec - last_sfx_at) < SFX_THROTTLE_SEC
        if not sfx_muted:
            last_sfx_at = start_sec
        transitions.append(
            {
                "id": f"tr-{boundary_idx}",
                "after_clip_id": after_clip["id"],
                "type": t_type,
                "duration_sec": DEFAULT_TRANSITION_SEC,
                "enabled": True,
                "sfx_muted": sfx_muted,
            }
        )
    return transitions


SIGNOFF_RE = (
    r"subscribe|thanks for watching|like and follow|see you next|"
    r"hit subscribe|don't forget to subscribe"
)


def detect_subscribe_overlay(
    captions: list[dict[str, Any]],
    total_duration: float,
) -> dict[str, Any] | None:
    """Legacy helper: build a subscribe_cta overlay dict for writing into timeline.v1.

    Prefer `activities.timeline_transitions.detect_subscribe_overlay` (used by pipeline).
    Editor load must never invent CTAs from captions — only map persisted overlays[].
    """
    import re

    if not captions:
        return None
    last = captions[-1]
    text = str(last.get("text") or "")
    if not re.search(SIGNOFF_RE, text, re.I):
        return None
    start = float(last.get("start_sec") or 0.0)
    duration = max(2.0, min(8.0, total_duration - start))
    return {
        "id": "overlay-subscribe-cta",
        "type": "subscribe_cta",
        "text": "Subscribe",
        "start_sec": start,
        "duration_sec": duration,
    }
