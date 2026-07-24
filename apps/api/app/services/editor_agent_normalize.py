"""Normalize LLM-emitted editor ops into the client allow-list shape."""

from __future__ import annotations

from typing import Any

ALLOWED_OPS = frozenset(
    {
        "delete_item",
        "move_item",
        "trim_item",
        "replace_media",
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
        "update_settings",
        "toggle_captions",
        "select_item",
        "set_playhead",
    }
)

_CAMEL = {
    "item_id": "itemId",
    "after_item_id": "afterItemId",
    "after_clip_id": "afterItemId",
    "transition_id": "transitionId",
    "start_ms": "startMs",
    "end_ms": "endMs",
    "duration_ms": "durationMs",
    "font_size": "fontSize",
    "font_weight": "fontWeight",
}


def _camelize_keys(obj: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in obj.items():
        key = _CAMEL.get(k, k)
        out[key] = v
    return out


def normalize_ops(raw_ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_ops:
        if not isinstance(item, dict):
            continue
        op = _camelize_keys(item)
        name = str(op.get("op") or "").strip()
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
                    "durationMs": int(op.get("durationMs") or 500),
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
                        "durationMs": int(op.get("durationMs") or 500),
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
                payload["durationMs"] = int(op["durationMs"])
            normalized.append(payload)
            continue

        if name == "add_animation":
            payload = {"op": "add_animation", "preset": op.get("preset") or "subscribe-cta"}
            if op.get("startMs") is not None:
                payload["startMs"] = int(op["startMs"])
            normalized.append(payload)
            continue

        if name == "add_caption":
            text = op.get("text") or "New caption"
            payload = {"op": "add_caption", "text": str(text)}
            if op.get("startMs") is not None:
                payload["startMs"] = int(op["startMs"])
            if op.get("durationMs") is not None:
                payload["durationMs"] = int(op["durationMs"])
            normalized.append(payload)
            continue

        cleaned: dict[str, Any] = {"op": name}
        for key in (
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
        ):
            if key in op and op[key] is not None:
                cleaned[key] = op[key]
        normalized.append(cleaned)

    return normalized
