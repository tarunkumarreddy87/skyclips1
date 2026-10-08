from src.activities.editorial_a_roll import assign_editorial_a_roll


def _clips(count=3):
    return [{"id": f"clip-{i}", "scene_id": f"scene-{i}", "src": f"media/{i}.jpg", "duration_sec": 8.0, "animation": {"in": {"preset": "fade"}}} for i in range(count)]


def test_full_frame_scene_replaces_clip_not_overlay():
    clips = _clips()
    sections = [
        {"id": "0", "title": "A question about history", "narration": "The story begins here."},
        {"id": "1", "title": "Historical chapter", "narration": "An archive opens.", "visual_treatment": {"editorial_template": "editorial-archive"}},
    ]
    selected = assign_editorial_a_roll(sections, clips, [], media_refs=[{"provider": "Pexels"}, {"source_url": "https://example.org/image"}])
    assert selected == {"clip-0", "clip-1"}
    assert clips[0]["motion_template"]["id"] == "editorial-title"
    assert clips[0]["motion_template"]["motion_component"] == "kinetic_title"
    assert clips[1]["motion_template"]["source_label"] == "example.org"
    assert "animation" not in clips[0]


def test_chart_requires_research_source_and_narrated_values():
    sections = [{"id": "0", "title": "Growth", "narration": "From 22 to 45 units.", "visual_treatment": {
        "editorial_template": "editorial-data", "editorial_source": "Census Bureau",
        "editorial_values": [{"label": "Start", "value": 22}, {"label": "End", "value": 45}],
    }}]
    clips = _clips(1)
    assert not assign_editorial_a_roll(sections, clips, [], research_summary="No cited source")
    assert "motion_template" not in clips[0]
    assert assign_editorial_a_roll(sections, clips, [], research_summary="Census Bureau reports growth") == {"clip-0"}
    assert clips[0]["motion_template"]["values"][1]["value"] == 45.0
    sections[0]["visual_treatment"]["editorial_values"][1]["value"] = 99
    assert not assign_editorial_a_roll(sections, _clips(1), [], research_summary="Census Bureau reports growth")


def test_legacy_graphic_is_full_frame_aroll():
    clips = _clips(3)
    sections = [
        {"id": "0", "title": "Opening", "narration": "The story begins."},
        {"id": "1", "title": "Then and now", "narration": "Before and after the change.",
         "visual_treatment": {"motion_graphic": "before-after-split"}},
        {"id": "2", "title": "The record", "narration": "A document reveals the answer."},
    ]
    selected = assign_editorial_a_roll(sections, clips, [], allowed_ids={"editorial-title", "before-after-split"})
    assert selected == {"clip-0", "clip-1"}
    assert clips[1]["motion_template"]["id"] == "before-after-split"
    assert "animation" not in clips[1]


def test_chart_requires_real_source_even_when_llm_picks_legacy_chart():
    sections = [{"id": "0", "title": "Growth", "narration": "From 22 to 45 units.", "visual_treatment": {
        "motion_graphic": "vertical-bar-chart", "editorial_source": "Census Bureau",
        "editorial_values": [{"label": "Start", "value": 22}, {"label": "End", "value": 45}],
    }}]
    assert not assign_editorial_a_roll(sections, _clips(1), [], research_summary="No verified source")
    clips = _clips(1)
    assert assign_editorial_a_roll(sections, clips, [], research_summary="Census Bureau figures") == {"clip-0"}
    assert clips[0]["motion_template"]["values"][0]["value"] == 22.0


def test_automatic_graphics_are_interleaved_with_media():
    clips = _clips(6)
    sections = [{"id": str(i), "title": f"Chapter {i}", "narration": "A documentary story."} for i in range(6)]
    selected = assign_editorial_a_roll(sections, clips, [], allowed_ids={"editorial-title", "editorial-newspaper"})
    assert selected == {"clip-0", "clip-2", "clip-4"}
    assert all("motion_template" not in clips[i] for i in (1, 3, 5))


def test_negative_chart_value_does_not_render_as_positive_bar():
    sections = [{"id": "0", "title": "Loss", "narration": "From -22 to 45 units.", "visual_treatment": {
        "motion_graphic": "vertical-bar-chart", "editorial_source": "Census Bureau",
        "editorial_values": [{"label": "Start", "value": -22}, {"label": "End", "value": 45}],
    }}]
    assert not assign_editorial_a_roll(sections, _clips(1), [], research_summary="Census Bureau figures")
