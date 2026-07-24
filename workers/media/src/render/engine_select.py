"""Render engine selection (ADR 0009) — Remotion-first product path.

Video editor exports always use Remotion when configured for Remotion.
``ffmpeg`` remains an ops-only force switch (not used by the editor product path).
"""

from __future__ import annotations

from typing import Any

_FORCE_FFMPEG = frozenset({"ffmpeg"})
_REMOTION = frozenset({"auto", "remotion-local", "remotion-lambda"})


def _preset_active(preset: Any) -> bool:
    if not isinstance(preset, str):
        return False
    key = preset.strip().lower()
    return bool(key) and key != "none"


def _animation_active(animation: Any) -> bool:
    if not isinstance(animation, dict):
        return False
    for edge_key in ("in", "out"):
        edge = animation.get(edge_key)
        if isinstance(edge, dict) and _preset_active(edge.get("preset")):
            return True
    loop = animation.get("loop")
    if isinstance(loop, dict) and _preset_active(loop.get("preset")):
        return True
    return False


def _has_export_transition(transition: dict[str, Any]) -> bool:
    if transition.get("enabled") is False:
        return False
    typ = str(transition.get("type") or "cut").strip().lower()
    if not typ or typ == "cut":
        return False
    try:
        duration = float(transition.get("duration_sec") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    return duration > 0


def timeline_needs_remotion(manifest: dict[str, Any]) -> tuple[bool, str]:
    """Return (has_motion_features, reason) for logging / UI hints.

    Product path always uses Remotion; this describes *why* Remotion is ideal,
    not whether we may fall back to FFmpeg.
    """
    transitions = manifest.get("transitions") or []
    if isinstance(transitions, list):
        for raw in transitions:
            if isinstance(raw, dict) and _has_export_transition(raw):
                typ = str(raw.get("type") or "transition")
                return True, f"non_cut_transition:{typ}"

    overlays = manifest.get("overlays") or []
    if isinstance(overlays, list) and len(overlays) > 0:
        first = overlays[0] if isinstance(overlays[0], dict) else {}
        kind = str(first.get("type") or "overlay")
        return True, f"overlay:{kind}"

    tracks = manifest.get("tracks") or {}
    if isinstance(tracks, dict):
        for track_name in ("video", "broll"):
            clips = tracks.get(track_name) or []
            if not isinstance(clips, list):
                continue
            for clip in clips:
                if not isinstance(clip, dict):
                    continue
                if _animation_active(clip.get("animation")):
                    return True, f"clip_animation:{track_name}"

    return False, "hard_cuts_only"


def resolve_render_engine(
    configured: str,
    manifest: dict[str, Any],
    *,
    render_service_configured: bool = True,
) -> tuple[str, str]:
    """Map configured RENDER_ENGINE + timeline → effective engine.

    Returns (effective_engine, decision_reason).

    - ``ffmpeg`` — ops-only force FFmpeg (not product / editor default).
    - ``auto`` | ``remotion-local`` | ``remotion-lambda`` — Remotion export.
      ``auto`` and ``remotion-local`` map to ``remotion-lambda`` when render-service
      is configured (production default). ``remotion-local`` uses subprocess bridge
      only when explicitly set without render-service.
    """
    engine = (configured or "remotion-local").strip().lower()
    _needs, detail = timeline_needs_remotion(manifest)

    if engine in _FORCE_FFMPEG:
        return "ffmpeg", f"forced_ffmpeg;{detail}"

    if engine not in _REMOTION:
        engine = "remotion-lambda" if render_service_configured else "remotion-local"
        return engine, f"unknown_configured:{configured};default_{engine};{detail}"

    if engine == "remotion-lambda":
        if render_service_configured:
            return "remotion-lambda", f"render_service;{detail}"
        return "remotion-local", f"no_render_service;fallback_local;{detail}"

    if engine == "auto":
        if render_service_configured:
            return "remotion-lambda", f"render_service;{detail}"
        return "remotion-local", f"remotion_only;{detail}"

    if engine == "remotion-local":
        return "remotion-local", f"remotion_only;{detail}"

    return "remotion-local", f"remotion_only;{detail}"
