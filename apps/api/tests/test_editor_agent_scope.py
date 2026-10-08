import pytest
from app.services.editor_agent_scope import validate_selection_scope


@pytest.fixture
def context():
    return {"selectedItemIds": ["scene"], "items": [
        {"id": "scene", "type": "video", "startMs": 1000, "endMs": 5000},
        {"id": "other", "type": "video", "startMs": 5000, "endMs": 9000},
        {"id": "caption", "type": "captions", "startMs": 1400, "endMs": 3000},
        {"id": "voice", "type": "narration", "startMs": 0, "endMs": 9000},
    ]}


def test_selected_scene_and_contained_caption_edit(context):
    validate_selection_scope([{"op": "replace_media", "itemId": "scene"}, {"op": "update_text", "itemId": "caption"}], context)


@pytest.mark.parametrize("op", [
    {"op": "replace_media", "itemId": "other"},
    {"op": "set_volume", "itemId": "voice"},
    {"op": "update_settings", "patch": {"musicVolume": 30}},
    {"op": "move_item", "itemId": "scene", "startMs": 2000},
    {"op": "add_sfx", "startMs": 4500, "durationMs": 1000},
    {"op": "add_text", "startMs": 2000},
    {"op": "add_motion_template", "startMs": 2000},
    {"op": "duplicate_item", "itemId": "scene"},
    {"op": "update_graphic", "itemId": "caption", "patch": {"start_sec": 9}},
])
def test_escape_rejected(context, op):
    with pytest.raises(ValueError):
        validate_selection_scope([op], context)


def test_timed_additions_and_explicit_history(context):
    validate_selection_scope([{"op": "add_sfx", "startMs": 4200, "durationMs": 800}, {"op": "add_motion_scene", "startMs": 1000, "scene": {"durationMs": 4000}}], context)
    validate_selection_scope([{"op": "undo"}], context)
    with pytest.raises(ValueError):
        validate_selection_scope([{"op": "undo"}, {"op": "delete_item", "itemId": "scene"}], context)


def test_no_selection_allows_whole_timeline():
    validate_selection_scope([{"op": "update_settings"}], {"items": []})


def test_stale_selection_rejected(context):
    context["selectedItemIds"] = ["gone"]
    with pytest.raises(ValueError):
        validate_selection_scope([], context)
