from src.activities.scene_graphics import build_scene_graphic

CLIP = {"id": "scene-1", "type": "image", "src": "photo.jpg", "start_sec": 7, "duration_sec": 4}


def test_frame_is_editable_and_bounded():
    result = build_scene_graphic({"title": "A journey", "visual_treatment": {"graphic": {"type": "frame"}}}, CLIP)
    assert result["src"] == "photo.jpg"
    assert result["start_sec"] == 7
    assert result["keyframes"][-1]["time_sec"] == 4


def test_chart_rejects_ungrounded_or_nonfinite_values():
    section = {"narration": "It rose from 100 to 200.", "visual_treatment": {"graphic": {"type": "bar_chart", "data": [{"label": "Before", "value": 100}, {"label": "After", "value": 200}]}}}
    assert build_scene_graphic(section, CLIP)["data"][1]["value"] == 200
    section["visual_treatment"]["graphic"]["data"][1]["value"] = 250
    assert build_scene_graphic(section, CLIP) is None
    section["visual_treatment"]["graphic"]["data"][1]["value"] = float("nan")
    assert build_scene_graphic(section, CLIP) is None


def test_no_graphic_without_direction_or_video_texture():
    assert build_scene_graphic({}, CLIP) is None
    assert build_scene_graphic({"visual_treatment": {"graphic": {"type": "frame"}}}, {**CLIP, "type": "video"}) is None
