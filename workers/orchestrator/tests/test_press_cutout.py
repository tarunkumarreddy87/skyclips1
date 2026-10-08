from copy import deepcopy

from src.activities.press_cutout import (
    TEMPLATE_ID, insert_templates, make_template, select_sections,
)


def prefs(**overrides):
    return {"motion_graphics": {"enabled": True, "templateId": TEMPLATE_ID,
                                "soundEnabled": True, "intensity": "cinematic", **overrides}}


def section(index, duration=30, **extra):
    return {"id": str(index), "title": "An archival story", "narration": "A documented event happened in 1947.",
            "actual_duration_sec": duration, **extra}


def test_templates_require_explicit_current_opt_in():
    sections = [section(1)]
    assert select_sections(sections, {}) == set()
    assert select_sections(sections, prefs(enabled=False)) == set()
    assert select_sections(sections, prefs(templateId="retired-template")) == set()
    assert select_sections(sections, prefs()) == {"1"}


def test_selected_beats_prefer_subjects_and_are_spaced_and_capped():
    sections = [section(i) for i in range(30)]
    sections[1]["visual_treatment"] = {"media_role": "person", "mood": "reveal"}
    selected = select_sections(sections, prefs())
    assert "1" in selected
    starts = sorted(int(sid) * 30 for sid in selected)
    assert len(starts) == 3
    assert all(b - a >= 60 for a, b in zip(starts, starts[1:]))
    assert len(select_sections(sections[:3], prefs())) == 1


def test_template_uses_scene_content_and_no_fabricated_publisher():
    ref = {"s3_key": "projects/p/run/scene.webp", "source_url": "https://archive.example/articles/story"}
    template = make_template(section(1), ref, 5, prefs(intensity="subtle"))
    assert template["eyebrow"] == "1947"
    assert template["source_label"] == "archive.example"
    assert template["motion_intensity"] == "subtle"
    data = template["html_template"]
    assert data["id"] == TEMPLATE_ID
    assert data["assets"][0]["url"] == ref["s3_key"]
    assert data["audioCues"][-1]["at"] == 4.7
    assert data["audioCues"][0]["sound"] == "press-paper"
    template = make_template(section(1, narration="The event changed the story."), ref, 10, prefs(soundEnabled=False))
    assert template["eyebrow"] == ""
    assert template["html_template"]["audioCues"] == []
    assert make_template(section(1), {"s3_key": "p.png"}, 10, prefs())["source_label"] == ""


def test_insert_preserves_duration_and_removes_only_overlapping_broll():
    original = {"id": "c1", "scene_id": "scene-1", "src": "projects/p/s.png", "type": "image",
                "start_sec": 0, "duration_sec": 30, "animation": {"type": "ken_burns"}}
    scenes = [{"id": "scene-1", "section_id": "1", "motion_graphics_template": TEMPLATE_ID,
               "asset_ref": {"s3_key": original["src"]}}]
    broll = [{"id": "b1", "start_sec": 5, "duration_sec": 10, "src": "b.png"}]
    backup = deepcopy(original)
    clips, updated_broll, treatments = insert_templates(
        [original], broll, [{"transition": "fade"}], scenes, {"1": section(1)}, prefs())
    assert original == backup
    assert [(c["start_sec"], c["duration_sec"]) for c in clips] == [(0, 10), (10, 20)]
    assert "animation" not in clips[0]
    assert clips[1]["animation"] == original["animation"]
    assert len(clips[0]["motion_template"]["html_template"]["audioCues"]) == 7
    assert treatments == [{"transition": "cut"}, {"transition": "fade"}]
    assert updated_broll[0]["start_sec"] == 10
    assert updated_broll[0]["duration_sec"] == 5


def test_short_insert_keeps_the_same_end_and_scales_cues():
    clip = {"id": "c1", "scene_id": "scene-1", "src": "projects/p/s.webp", "type": "image", "start_sec": 0, "duration_sec": 6}
    scenes = [{"id": "scene-1", "section_id": "1", "motion_graphics_template": TEMPLATE_ID,
               "asset_ref": {"s3_key": clip["src"]}}]
    clips, _, _ = insert_templates([clip], [], [{}], scenes, {"1": section(1)}, prefs())
    assert len(clips) == 1
    assert clips[0]["duration_sec"] == 6
    assert clips[0]["motion_template"]["html_template"]["audioCues"][-1]["at"] == 5.64


def test_timeline_integration_keeps_narration_and_caption_clocks(monkeypatch):
    import asyncio
    from src.activities import pipeline, music_beds
    from src.pipeline import storage

    script_section = section(1, narration="A documented event happened in 1947. Its effects endured.")
    script_section["tts_pieces"] = [
        {"text": "A documented event happened in 1947.", "duration_sec": 15},
        {"text": "Its effects endured.", "duration_sec": 15},
    ]
    scenes = [{"id": "scene-1", "section_id": "1", "duration_sec": 30,
               "motion_graphics_template": TEMPLATE_ID,
               "asset_ref": {"s3_key": "projects/p/r/subject.webp"}, "broll_asset_ref": {}}]
    monkeypatch.setattr(pipeline, "get_json", lambda key: {"scenes": scenes} if key.endswith("scenes.json") else {"language": "en", "sections": [script_section]})
    monkeypatch.setattr(storage, "get_bytes", lambda key: pipeline._silent_wav(30))
    monkeypatch.setattr(storage, "put_bytes", lambda *args: None)
    saved = {}
    async def save(ctx, name, content, *args):
        saved[name] = content
    async def progress(*args):
        pass
    def music(path, **kwargs):
        path.write_bytes(b"audio")
        return {"mood": "documentary", "label": "Documentary"}
    monkeypatch.setattr(pipeline, "_save_artifact", save)
    monkeypatch.setattr(pipeline, "_progress", progress)
    monkeypatch.setattr(music_beds, "synthesize_music_bed", music)
    asyncio.run(pipeline.build_timeline({**prefs(), "project_id": "p", "run_id": "r", "format_mode": "documentary"}))
    manifest = saved["timeline.v1.json"]
    assert manifest["metadata"]["duration_sec"] == 30
    assert manifest["tracks"]["audio"][0]["duration_sec"] == 30
    assert [clip["duration_sec"] for clip in manifest["tracks"]["video"]] == [10, 20]
    captions = manifest["tracks"]["captions"]
    assert captions[0]["start_sec"] == 0
    assert max(c["start_sec"] + c["duration_sec"] for c in captions) <= 30
    assert len({c["id"] for c in captions}) == len(captions)
    assert not manifest["transitions"]
