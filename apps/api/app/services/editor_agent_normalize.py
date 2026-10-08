"""Normalize LLM-emitted editor ops into the client allow-list shape."""

from __future__ import annotations

import math
import re
from urllib.parse import urlparse
from typing import Any

ALLOWED_OPS = frozenset(
    {
        "add_graphic", "update_graphic", "set_keyframes", "add_media", "update_track", "update_clip", "undo", "redo",
        "delete_item",
        "move_item",
        "trim_item",
        "replace_media",
        "remove_background",
        "add_caption",
        "add_text",
        "update_text",
        "update_text_position",
        "add_music",
        "add_sfx",
        "add_broll",
        "set_volume",
        "add_transition",
        "set_transition",
        "remove_transition",
        "add_animation",
        "add_motion_template",
        "add_motion_scene",
        "update_motion_scene",
        "update_item_animation",
        "update_transform",
        "update_fit_mode",
        "update_audio_fades",
        "update_caption_style",
        "duplicate_item",
        "split_item",
        "update_settings",
        "toggle_captions",
        "select_item",
        "set_playhead",
        "update_motion_template",
        "set_text_style",
        "set_clip_muted",
        "toggle_item_hidden",
        "bring_to_front",
        "send_to_back",
        "set_theme",
        "toggle_track_hidden",
        "update_clip_effects",
        "set_transition_sound",
    }
)

_CAMEL = {
    "three_scene": "threeScene",
    "item_id": "itemId", "asset_id": "assetId", "track_id": "trackId",
    "after_item_id": "afterItemId",
    "after_clip_id": "afterItemId",
    "transition_id": "transitionId",
    "start_ms": "startMs",
    "end_ms": "endMs",
    "duration_ms": "durationMs",
    "font_size": "fontSize",
    "font_weight": "fontWeight",
    "template_id": "templateId",
    "fit_mode": "fitMode",
    "fade_in_ms": "fadeInMs",
    "fade_out_ms": "fadeOutMs",
    "at_ms": "atMs",
    "image_refs": "imageRefs",
    "theme_id": "themeId",
    "box_width_pct": "boxWidthPct",
    "style_preset": "stylePreset",
    "font_family": "fontFamily",
    "track_type": "trackType",
    "z_index": "zIndex",
    "scale_x": "scaleX",
    "scale_y": "scaleY",
    "layer_edits": "layerEdits",
    "library_template_id": "libraryTemplateId",
    "documentary_layout": "documentaryLayout",
    "source_label": "sourceLabel",
    "time_ms": "timeMs",
    "stroke_width": "strokeWidth",
    "stroke_color": "strokeColor",
    "filter_id": "filterId",
    "effect_id": "effectId",
    "effect_strength": "effectStrength",
    "background_color": "backgroundColor",
    "background_image": "backgroundImage",
    "overlay_drop_shadow": "overlayDropShadow",
    "music_volume": "musicVolume",
    "sfx_volume": "sfxVolume",
    "clip_audio_volume": "clipAudioVolume",
    "captions_enabled": "captionsEnabled",
    "show_transitions": "showTransitions",
    "caption_style": "captionStyle", "narration_volume": "narrationVolume",
}

# Payload keys that survive normalization. A key missing here is silently dropped,
# which turns the op into a no-op on the client — keep in sync with AgentOp in
# apps/web/src/lib/editor/agent/ops.ts.
_PASSTHROUGH_KEYS = (
    "threeScene",
    "assetId", "trackId", "hidden", "locked", "mediaType", "keyframes", "src", "width_pct", "height_pct", "shape", "data",
    "layerEdits",
    "libraryTemplateId",
    "documentaryLayout",
    "elements",
    "links",
    "sourceLabel",
    "scene",
    "itemId",
    "url",
    "text",
    "startMs",
    "endMs",
    "durationMs",
    "volume",
    "label",
    "type",
    "transitionId",
    "afterItemId",
    "preset",
    "enabled",
    "ms",
    "x",
    "y",
    "fontSize",
    "color",
    "fontWeight",
    "alignment",
    "patch",
    "templateId",
    "title",
    "subtitle",
    "slots",
    "imageRefs",
    "themeId",
    "boxWidthPct",
    "transform",
    "animation",
    "fitMode",
    "fadeInMs",
    "fadeOutMs",
    "style",
    "atMs",
    "muted",
    "stylePreset",
    "fontFamily",
    "trackType",
)


def _camelize_keys(obj: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in obj.items():
        key = _CAMEL.get(k, k)
        # Canonical spelling wins if a model supplied both versions.
        if k != key and key in obj:
            continue
        if key == "threeScene":
            # This embedded schema uses time_sec; do not rewrite scene properties.
            pass
        elif key == "layerEdits" and isinstance(v, dict):
            # The keys of this record are actual layer IDs, not field names.
            v = {layer_id: _camelize_keys(edit) if isinstance(edit, dict) else edit for layer_id, edit in v.items()}
        elif isinstance(v, dict):
            v = _camelize_keys(v)
        elif isinstance(v, list):
            v = [_camelize_keys(entry) if isinstance(entry, dict) else entry for entry in v]
        out[key] = v
    return out


def _time(value: Any) -> float:
    """Preserve fractional timeline times and reject non-finite model values."""
    if isinstance(value, bool):
        raise ValueError("Timeline times must be numbers in milliseconds")
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError("Timeline times must be finite non-negative milliseconds")
    return result


CAPTION_STYLES = frozenset({"cinematic", "clean_highlight", "kinetic", "editorial", "bold_static", "karaoke", "boxed_pill", "minimal", "neon", "typewriter"})
TRANSITIONS = frozenset({"cut", "zoom", "slide-pan", "film-burn", "glitch", "fade", "slide", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "slideup", "slidedown", "circleopen", "circleclose", "dissolve", "pixelize"})

def _number(value: Any, low: float = 0, high: float = 86_400_000) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high

def _url(value: Any) -> bool:
    if not isinstance(value, str): return False
    try: parsed = urlparse(value)
    except ValueError: return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)

def _keyframes(value: Any, duration_sec: float | None = None) -> bool:
    if not isinstance(value, list) or len(value) > 100: return False
    previous = -1.0
    for frame in value:
        if not isinstance(frame, dict) or set(frame) - {"time_sec", "x", "y", "scale", "rotation", "opacity"}: return False
        at = frame.get("time_sec")
        if not _number(at, 0, duration_sec if duration_sec is not None else 86_400) or at <= previous: return False
        previous = at
        for key, limits in {"x": (-100, 200), "y": (-100, 200), "scale": (0.01, 10), "rotation": (-3600, 3600), "opacity": (0, 1)}.items():
            if key in frame and not _number(frame[key], *limits): return False
    return True

def _graphic(value: dict[str, Any], *, partial: bool = False) -> bool:
    if (not partial or "type" in value) and value.get("type") not in {"frame", "bar_chart", "shape"}: return False
    if "src" in value and not _url(value["src"]): return False
    if "text" in value and (not isinstance(value["text"], str) or len(value["text"]) > 4000): return False
    if "color" in value and (not isinstance(value["color"], str) or not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", value["color"])): return False
    if "transform" in value:
        transform = value["transform"]
        limits = {"x": (-100, 200), "y": (-100, 200), "scaleX": (-10, 10), "scaleY": (-10, 10), "rotation": (-3600, 3600), "zIndex": (-100, 100)}
        if not isinstance(transform, dict) or set(transform) - set(limits) or any(not _number(v, *limits[k]) for k, v in transform.items()): return False
    if partial and set(value) - {"type", "text", "src", "color", "width_pct", "height_pct", "shape", "data", "transform", "keyframes"}: return False
    for key in ("width_pct", "height_pct"):
        if key in value and not _number(value[key], 1, 100): return False
    if "shape" in value and value["shape"] not in {"rectangle", "circle"}: return False
    if "data" in value:
        data = value["data"]
        if not isinstance(data, list) or not 1 <= len(data) <= 12: return False
        if any(not isinstance(point, dict) or not isinstance(point.get("label"), str) or len(point["label"]) > 60 or not _number(point.get("value"), 0, 1e12) for point in data): return False
    elif value.get("type") == "bar_chart" and not partial: return False
    return "keyframes" not in value or _keyframes(value["keyframes"], value.get("durationMs", 4000) / 1000 if not partial else None)

def _valid(op: dict[str, Any]) -> bool:
    name = op["op"]
    if name == "update_clip" and "threeScene" in op and op["threeScene"] is not None:
        from hanuman_timeline_schema import validate_three_scene
        if validate_three_scene(op["threeScene"]): return False
    required = {
        "move_item": {"itemId", "startMs"}, "trim_item": {"itemId", "startMs", "endMs"}, "split_item": {"itemId", "atMs"},
        "replace_media": {"itemId", "url"}, "update_text_position": {"itemId", "x", "y"}, "add_media": {"assetId"},
        "set_volume": {"itemId", "volume"}, "set_audio_fades": {"itemId", "fadeInMs", "fadeOutMs"},
        "add_transition": {"afterItemId", "type"}, "set_transition": {"transitionId", "type"}, "remove_transition": {"transitionId"}, "set_transition_sound": {"transitionId", "enabled"}, "update_track": {"trackId"},
        "set_keyframes": {"itemId", "keyframes"}, "set_caption_style": {"style"}, "update_transform": {"itemId", "transform"}, "set_animation": {"itemId", "animation"},
        "update_settings": {"patch"}, "update_graphic": {"itemId", "patch"}, "toggle_captions": {"enabled"}, "set_playhead": {"ms"},
    }.get(name, set())
    if name in {"delete_item", "duplicate_item", "update_text", "update_clip", "select_item"}: required = {"itemId"}
    if not required.issubset(op): return False
    for key in ("trackId", "itemId", "assetId", "afterItemId", "transitionId"):
        if key in op and (not isinstance(op[key], str) or not op[key].strip() or len(op[key]) > 200): return False
    for key in ("startMs", "endMs", "atMs", "ms", "fadeInMs", "fadeOutMs"):
        if key in op and not _number(op[key]): return False
    if "durationMs" in op and not _number(op["durationMs"], 0 if "transition" in name else 1, 5000 if "transition" in name else 86_400_000): return False
    if name == "trim_item" and op["endMs"] <= op["startMs"]: return False
    for key in ("url", "src"):
        if key in op and not _url(op[key]): return False
    if "volume" in op and not _number(op["volume"], 0, 1): return False
    for key in ("x", "y"):
        if key in op and not _number(op[key], -100, 200): return False
    if "color" in op and (not isinstance(op["color"], str) or not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", op["color"])): return False
    if "fontSize" in op and not _number(op["fontSize"], 8, 180): return False
    if "boxWidthPct" in op and not _number(op["boxWidthPct"], 18, 88): return False
    for key in ("text", "label"):
        if key in op and (not isinstance(op[key], str) or len(op[key]) > (4000 if key == "text" else 200)): return False
    if "transition" in name and name not in {"remove_transition", "set_transition_sound"} and op.get("type") not in TRANSITIONS: return False
    if name == "add_animation" and op.get("preset") not in {"subscribe-cta", "chapter-title", "lower-third"}: return False
    if name == "add_sfx" and "preset" in op and op["preset"] not in {"soft_whoosh", "soft_impact", "editorial_tick"}: return False
    if name == "set_caption_style" and op["style"] not in CAPTION_STYLES: return False
    if name == "add_graphic" and not _graphic(op): return False
    if name == "update_graphic" and (not isinstance(op["patch"], dict) or not op["patch"] or not _graphic(op["patch"], partial=True)): return False
    if name == "set_keyframes" and not _keyframes(op["keyframes"]): return False
    if name == "update_settings":
        patch = op["patch"]
        allowed = {"backgroundColor", "backgroundImage", "overlayDropShadow", "narrationVolume", "musicVolume", "sfxVolume", "clipAudioVolume", "captionsEnabled", "showTransitions", "captionStyle", "snappingEnabled", "themeId"}
        if not isinstance(patch, dict) or set(patch) - allowed: return False
        for key, value in patch.items():
            if key.endswith("Volume") and not _number(value, 0, 1): return False
            if key in {"overlayDropShadow", "captionsEnabled", "showTransitions", "snappingEnabled"} and not isinstance(value, bool): return False
            if key == "captionStyle" and value not in CAPTION_STYLES: return False
            if key == "backgroundImage" and value is not None and not _url(value): return False
    if name in {"toggle_captions", "set_transition_sound"} and not isinstance(op["enabled"], bool): return False
    for key in ("hidden", "locked"):
        if key in op and not isinstance(op[key], bool): return False
    return True



def normalize_ops(raw_ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_ops:
        if not isinstance(item, dict):
            continue
        op = _camelize_keys(item)
        name = str(op.get("op") or "").strip()
        name = {"set_caption_style": "update_caption_style", "set_animation": "update_item_animation", "set_audio_fades": "update_audio_fades"}.get(name, name)
        op["op"] = name
        if name not in ALLOWED_OPS:
            continue

        if name == "add_transition":
            after = op.get("afterItemId") or op.get("itemId")
            if not after:
                continue
            normalized.append(
                {
                    "op": "add_transition",
                    "afterItemId": after,
                    "type": op.get("type") or "fade",
                    "durationMs": _time(op.get("durationMs") if op.get("durationMs") is not None else 500),
                }
            )
            continue

        if name == "set_transition":
            tid = op.get("transitionId")
            if not tid and op.get("itemId"):
                normalized.append(
                    {
                        "op": "add_transition",
                        "afterItemId": op["itemId"],
                        "type": op.get("type") or "fade",
                        "durationMs": _time(op.get("durationMs") if op.get("durationMs") is not None else 500),
                    }
                )
                continue
            if not tid:
                continue
            payload: dict[str, Any] = {
                "op": "set_transition",
                "transitionId": tid,
                "type": op.get("type") or "fade",
            }
            if op.get("durationMs") is not None:
                payload["durationMs"] = _time(op["durationMs"])
            normalized.append(payload)
            continue

        if name == "add_animation":
            payload = {"op": "add_animation", "preset": op.get("preset") or "subscribe-cta"}
            if op.get("startMs") is not None:
                payload["startMs"] = _time(op["startMs"])
            normalized.append(payload)
            continue

        if name == "add_motion_template" and not op.get("templateId"):
            # Without a template id the client would add an untyped overlay.
            continue

        if name == "add_caption":
            text = op.get("text") or "New caption"
            payload = {"op": "add_caption", "text": str(text)}
            if op.get("startMs") is not None:
                payload["startMs"] = _time(op["startMs"])
            if op.get("durationMs") is not None:
                payload["durationMs"] = _time(op["durationMs"])
            normalized.append(payload)
            continue

        cleaned: dict[str, Any] = {"op": name}
        for key in _PASSTHROUGH_KEYS:
            if key in op and (op[key] is not None or key == "threeScene"):
                cleaned[key] = op[key]
        # Text items use CSS font-weight strings; scene layers use numeric weights.
        if name == "update_text" and isinstance(cleaned.get("fontWeight"), (int, float)):
            cleaned["fontWeight"] = str(cleaned["fontWeight"])
        if name in {"add_graphic", "update_graphic", "set_keyframes", "add_media", "update_track", "update_clip", "undo", "redo"} and not _valid(cleaned):
            continue
        normalized.append(cleaned)

    return normalized
