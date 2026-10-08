"""Enforce selected-clip boundaries independently of model instructions."""
import math


def validate_selection_scope(ops: list[dict], context: dict) -> None:
    selected = context.get("selectedItemIds") or ([context["selectedItemId"]] if context.get("selectedItemId") else [])
    if not selected:
        return
    items = {item["id"]: item for item in context.get("items", []) if isinstance(item, dict) and "id" in item}
    if any(item_id not in items for item_id in selected):
        raise ValueError("The selected clip no longer exists. Select it again.")
    windows = [(items[item_id].get("startMs"), items[item_id].get("endMs")) for item_id in selected]

    def inside(start, end):
        return all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (start, end)) and any(
            isinstance(left, (int, float)) and isinstance(right, (int, float)) and left <= start < end <= right for left, right in windows)

    linked_types = {"captions", "text", "animation", "sfx", "broll"}
    allowed = set(selected)
    allowed.update(item_id for item_id, item in items.items() if item.get("type") in linked_types and inside(item.get("startMs"), item.get("endMs")))
    additions = {"add_text", "add_caption", "add_broll", "add_sfx", "add_music", "add_graphic", "add_motion_scene", "add_media"}
    for op in ops:
        name = op.get("op")
        if name in {"set_playhead", "select_item"}:
            continue
        # History navigation is an explicit user action, never an implicit repair.
        if name in {"undo", "redo"} and len(ops) == 1:
            continue
        if name in additions:
            start = op.get("startMs")
            duration = op.get("scene", {}).get("durationMs") if name == "add_motion_scene" else op.get("durationMs")
            if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not isinstance(start, (int, float)) or isinstance(start, bool) or not inside(start, start + duration):
                raise ValueError("Selected-clip additions need explicit timing entirely inside the selected clip.")
            continue
        target = op.get("itemId")
        if target not in allowed:
            raise ValueError("This edit changes something outside the selected clip. Select the intended clips or clear the selection for a whole-video edit.")
        if name in {"duplicate_item", "add_animation", "add_transition", "set_transition", "remove_transition", "set_transition_sound"}:
            raise ValueError("This operation can affect adjacent clips and is unavailable in selected-clip mode.")
        item = items[target]
        start, end = item.get("startMs"), item.get("endMs")
        if name == "move_item":
            start = op.get("startMs")
            end = start + item["endMs"] - item["startMs"] if isinstance(start, (int, float)) else None
        elif name == "trim_item":
            start, end = op.get("startMs"), op.get("endMs")
        elif name == "update_motion_scene":
            duration = op.get("scene", {}).get("durationMs")
            end = start + duration if isinstance(start, (int, float)) and isinstance(duration, (int, float)) else None
        elif name in {"update_graphic", "update_motion_template"}:
            if any(key in op.get("patch", {}) for key in ("startMs", "endMs", "durationMs", "start_sec", "duration_sec", "id", "assetId", "trackId")):
                raise ValueError("Selected-clip patches cannot change identity or timing.")
        if not inside(start, end):
            raise ValueError("The edit extends beyond the selected clip.")
