"""Preset → FFmpeg filter mapping (ADR 0007).

Timing is always relative to the clip's own start (t=0 … duration_sec).
Absolute start_sec is applied by the pipeline when compositing.
"""

from __future__ import annotations

from typing import Any

# Native xfade names (must exist in `ffmpeg -h filter=xfade`).
XFADE_TRANSITION_MAP: dict[str, str] = {
    "fade": "fade",
    "dissolve": "dissolve",
    "wipeleft": "wipeleft",
    "wiperight": "wiperight",
    "wipeup": "wipeup",
    "wipedown": "wipedown",
    "slideleft": "slideleft",
    "slideright": "slideright",
    "slideup": "slideup",
    "slidedown": "slidedown",
    "slide": "slideright",
    "slide-pan": "smoothleft",
    "zoom": "zoomin",
    "circleopen": "circleopen",
    "circleclose": "circleclose",
    "pixelize": "pixelize",
}

CUSTOM_TRANSITION_TYPES = frozenset({"film-burn", "glitch", "cut"})

_ALIASES: dict[str, str] = {
    "slidepan": "slide-pan",
    "filmburn": "film-burn",
    "circle-open": "circleopen",
    "circle-close": "circleclose",
    "wipe-left": "wipeleft",
    "wipe-right": "wiperight",
    "wipe-up": "wipeup",
    "wipe-down": "wipedown",
    "slide-left": "slideleft",
    "slide-right": "slideright",
    "slide-up": "slideup",
    "slide-down": "slidedown",
}

def normalize_transition_type(transition_type: str) -> str:
    key = (transition_type or "fade").strip().lower().replace("_", "-")
    return _ALIASES.get(key, key)


def map_xfade_name(transition_type: str) -> str:
    key = normalize_transition_type(transition_type)
    return XFADE_TRANSITION_MAP.get(key, "fade")


def _edge(anim: dict[str, Any] | None, which: str) -> tuple[str, float]:
    if not anim or not isinstance(anim, dict):
        return "none", 0.0
    edge = anim.get(which) or {}
    if not isinstance(edge, dict):
        return "none", 0.0
    preset = str(edge.get("preset") or "none").strip().lower()
    dur = float(edge.get("duration_sec") or 0.0)
    return preset, max(0.0, dur)


def _append_edge_motion(
    parts: list[str],
    *,
    preset: str,
    dur: float,
    clip_dur: float,
    edge: str,
    fps: int,
) -> None:
    """Distinct In/Out motion on a full-frame clip (after fit)."""
    if preset == "none" or dur <= 0.05:
        return

    if preset in {"zoom_in", "ken_burns_in"} and edge == "in":
        parts.append(f"fade=t=in:st=0:d={dur:.3f}")
        return
    if preset in {"zoom_out", "ken_burns_out"} and edge == "out":
        st = max(0.0, clip_dur - dur)
        parts.append(f"fade=t=out:st={st:.3f}:d={dur:.3f}")
        return

    if preset == "fade":
        if edge == "in":
            parts.append(f"fade=t=in:st=0:d={dur:.3f}")
        else:
            st = max(0.0, clip_dur - dur)
            parts.append(f"fade=t=out:st={st:.3f}:d={dur:.3f}")
        return

    if preset == "spin":
        if edge == "in":
            parts.append(f"rotate=a='-PI/2*(1-min(1\\,t/{dur:.3f}))':c=black")
            parts.append(f"fade=t=in:st=0:d={dur:.3f}")
        else:
            st = max(0.0, clip_dur - dur)
            parts.append(
                f"rotate=a='PI/2*max(0\\,min(1\\,(t-{st:.3f})/{dur:.3f}))':c=black"
            )
            parts.append(f"fade=t=out:st={st:.3f}:d={dur:.3f}")
        return

    if preset == "pop" and edge == "in":
        n = max(1, int(round(dur * fps)))
        parts.append(
            f"zoompan=z='0.65+0.35*min(1\\,on/{n})':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={fps}"
        )
        parts.append(f"fade=t=in:st=0:d={dur:.3f}")
        return

    if preset == "wipe" and edge == "in":
        # Reveal left→right by cropping then padding.
        parts.append(
            f"crop=w='max(2\\,min(1920\\,1920*t/{dur:.3f}))':1920:0:0,"
            f"pad=1920:1080:0:0:black"
        )
        return

    # float / drop / slide / bounce / slide_bounce (+ out edges): fade with character
    if edge == "in":
        parts.append(f"fade=t=in:st=0:d={dur:.3f}")
        if preset in {"drop", "bounce", "float"}:
            # Soft settle: slight zoom from 1.05 → 1.0
            n = max(1, int(round(dur * fps)))
            parts.insert(
                max(0, len(parts) - 1),
                f"zoompan=z='1.05-0.05*min(1\\,on/{n})':"
                f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={fps}",
            )
        elif preset in {"slide", "slide_bounce"}:
            n = max(1, int(round(dur * fps)))
            parts.insert(
                max(0, len(parts) - 1),
                f"zoompan=z='1':x='iw/2-(iw/zoom/2)-(1-min(1\\,on/{n}))*iw*0.15':"
                f"y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={fps}",
            )
    else:
        st = max(0.0, clip_dur - dur)
        parts.append(f"fade=t=out:st={st:.3f}:d={dur:.3f}")


def build_clip_motion_filters(
    *,
    duration_sec: float,
    animation: dict[str, Any] | None = None,
    transform: dict[str, Any] | None = None,
    fps: int = 30,
    pad_to_frame: bool = True,
) -> list[str]:
    """Return vf chain pieces after fit-to-frame (1920x1080).

    Order: Ken Burns / zoompan → geometric transform → edge motion / fade.
    """
    parts: list[str] = []
    dur = max(0.05, float(duration_sec))
    in_preset, in_dur = _edge(animation, "in")
    out_preset, out_dur = _edge(animation, "out")
    loop = ((animation or {}).get("loop") or {}) if isinstance(animation, dict) else {}
    loop_preset = str(loop.get("preset") or "none").strip().lower() if isinstance(loop, dict) else "none"

    in_dur = min(in_dur, dur * 0.45) if in_preset != "none" else 0.0
    out_dur = min(out_dur, dur * 0.45) if out_preset != "none" else 0.0
    frames = max(1, int(round(dur * fps)))

    zoom_preset = "none"
    if in_preset in {"zoom_in", "ken_burns_in"}:
        zoom_preset = in_preset
    elif out_preset in {"zoom_out", "ken_burns_out"}:
        zoom_preset = out_preset
    elif loop_preset == "ken_burns":
        zoom_preset = "ken_burns"

    if zoom_preset in {"zoom_in", "ken_burns_in"}:
        parts.append(
            f"zoompan=z='min(1.2,1+0.2*on/{max(frames - 1, 1)})':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps={fps}"
        )
    elif zoom_preset in {"zoom_out", "ken_burns_out"}:
        parts.append(
            f"zoompan=z='max(1.0,1.2-0.2*on/{max(frames - 1, 1)})':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps={fps}"
        )
    elif zoom_preset == "ken_burns":
        parts.append(
            f"zoompan=z='1.05+0.08*sin(2*PI*on/{max(frames, 1)})':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps={fps}"
        )
    elif loop_preset == "pulse":
        parts.append(
            "scale=w='1920*(1+0.04*sin(2*PI*t))':h='1080*(1+0.04*sin(2*PI*t))',"
            "crop=1920:1080"
        )
    elif loop_preset == "float":
        parts.append(
            "crop=1920:1080:0:'4+4*sin(2*PI*t/2)'"
        )

    t = transform if isinstance(transform, dict) else {}
    sx = float(t.get("scaleX") if t.get("scaleX") is not None else 1.0)
    sy = float(t.get("scaleY") if t.get("scaleY") is not None else 1.0)
    rot = float(t.get("rotation") if t.get("rotation") is not None else 0.0)
    x_pct = float(t.get("x") if t.get("x") is not None else 50.0)
    y_pct = float(t.get("y") if t.get("y") is not None else 50.0)
    sx = max(0.05, min(4.0, sx))
    sy = max(0.05, min(4.0, sy))
    needs_scale = abs(sx - 1.0) >= 0.001 or abs(sy - 1.0) >= 0.001
    needs_rotate = abs(rot) >= 0.01
    needs_pos = abs(x_pct - 50.0) >= 0.01 or abs(y_pct - 50.0) >= 0.01

    if needs_scale or needs_rotate or (pad_to_frame and needs_pos):
        if needs_scale:
            parts.append(f"scale=1920*{sx:.4f}:1080*{sy:.4f}")
        if needs_rotate:
            rad = rot * 3.141592653589793 / 180.0
            parts.append(f"rotate={rad:.6f}:c=black")
        if pad_to_frame:
            parts.append(
                "pad=1920:1080:"
                f"(1920-iw)/2+((({x_pct:.3f}-50)/100)*1920):"
                f"(1080-ih)/2+((({y_pct:.3f}-50)/100)*1080):black"
            )

    _append_edge_motion(parts, preset=in_preset, dur=in_dur, clip_dur=dur, edge="in", fps=fps)
    _append_edge_motion(parts, preset=out_preset, dur=out_dur, clip_dur=dur, edge="out", fps=fps)

    return parts


def build_segment_vf(
    *,
    fit: str,
    duration_sec: float,
    animation: dict[str, Any] | None = None,
    transform: dict[str, Any] | None = None,
    fps: int = 30,
    pad_to_frame: bool = True,
) -> str:
    """Full -vf string for a single clip segment."""
    if fit == "contain":
        base = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    else:
        base = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080"
    motion = build_clip_motion_filters(
        duration_sec=duration_sec,
        animation=animation,
        transform=transform,
        fps=fps,
        pad_to_frame=pad_to_frame,
    )
    if not motion:
        return base
    return ",".join([base, *motion])


def build_broll_vf(
    *,
    fit: str,
    duration_sec: float,
    animation: dict[str, Any] | None = None,
    transform: dict[str, Any] | None = None,
    fps: int = 30,
) -> str:
    """Overlay clip vf: fit + motion without padding to full frame."""
    return build_segment_vf(
        fit=fit,
        duration_sec=duration_sec,
        animation=animation,
        transform=transform,
        fps=fps,
        pad_to_frame=False,
    )


def broll_overlay_xy(transform: dict[str, Any] | None) -> tuple[str, str, float, float]:
    """Return (x_expr, y_expr, scale_x, scale_y) for overlay placement."""
    t = transform if isinstance(transform, dict) else {}
    sx = float(t.get("scaleX") if t.get("scaleX") is not None else 1.0)
    sy = float(t.get("scaleY") if t.get("scaleY") is not None else 1.0)
    x_pct = float(t.get("x") if t.get("x") is not None else 50.0)
    y_pct = float(t.get("y") if t.get("y") is not None else 50.0)
    sx = max(0.05, min(4.0, sx))
    sy = max(0.05, min(4.0, sy))
    x_expr = f"(W-w)/2+(({x_pct:.3f}-50)/100)*W"
    y_expr = f"(H-h)/2+(({y_pct:.3f}-50)/100)*H"
    return x_expr, y_expr, sx, sy
