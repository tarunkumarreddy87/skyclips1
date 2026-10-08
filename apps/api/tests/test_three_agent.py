import pytest
from app.services.editor_agent_normalize import normalize_ops
from app.services.editor_agent_service import _validate_edit_op

def scene():
    return {"version": 1, "background": "#080e1e", "camera": {"position": [0, 1, 6]},
            "objects": [{"id": "box", "geometry": "box", "color": "#38bdf8",
                         "keyframes": [{"time_sec": 0, "position": [0, 0, 0]}, {"time_sec": 1, "position": [1, 0, 0]}]}]}

def test_three_scene_survives_agent_normalization_and_null_removal():
    data = scene()
    ops = normalize_ops([{"op": "update_clip", "item_id": "clip", "three_scene": data},
                         {"op": "update_clip", "itemId": "clip", "threeScene": None}])
    assert ops == [{"op": "update_clip", "itemId": "clip", "threeScene": data},
                   {"op": "update_clip", "itemId": "clip", "threeScene": None}]
    for op in ops: _validate_edit_op(op, {})

def test_three_agent_rejects_executable_or_invalid_scenes():
    for data in [{**scene(), "script": "alert(1)"}, {**scene(), "camera": {"position": [0, 0, 0]}}, {**scene(), "camera": {"position": [1, 2]}}]:
        op = {"op": "update_clip", "itemId": "clip", "threeScene": data}
        assert normalize_ops([op]) == []
        with pytest.raises(ValueError, match="Three.js"):
            _validate_edit_op(op, {})
