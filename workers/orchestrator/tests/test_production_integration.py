"""Behavioral integration coverage of main-agent artifacts into final timeline."""
import asyncio
import copy
from unittest.mock import AsyncMock

import pytest
from src.activities import pipeline
from src.pipeline import storage
from src.pipeline.director import apply_decision, inspect_timeline


def build(monkeypatch, *, preferences=None, blocked=None, three=False, broll=False, visual=None):
    scenes = [{"id": "scene-s1", "section_id": "s1", "duration_sec": 10,
               "asset_ref": {"s3_key": "projects/p/runs/r/clip.mp4"}},
              {"id": "scene-s2", "section_id": "s2", "duration_sec": 10,
               "asset_ref": {"s3_key": "projects/p/runs/r/image.jpg"}}]
    if broll:
        scenes[0]["broll_asset_ref"] = {"s3_key": "projects/p/runs/r/detail.jpg"}
    documents = {"scenes.json": {"scenes": scenes}, "script.json": {"language": "en", "sections": [
        {"id": "s1", "narration": "First chapter.", "actual_duration_sec": 10},
        {"id": "s2", "narration": "Second chapter.", "actual_duration_sec": 10}]},
        "agent-visual-plan.json": {"sections": {"s1": {"transition": "glitch", "visual_effects": {"brightness": 1.1}},
                                                  "s2": {"transition": "cut", "visual_effects": {"brightness": 1.}}}},
        "agent-sound-plan.json": {"cues": []}, "agent-motion-templates.json": {"templates": [
            {"sectionId": "s1", "durationSec": 4, "threeScene": {"version": 1, "objects": []}}]}}
    if visual:
        documents["agent-visual-plan.json"]["sections"]["s1"].update(visual)
    monkeypatch.setattr(pipeline, "get_json", lambda key: copy.deepcopy(documents[key.rsplit("/", 1)[-1]]))
    monkeypatch.setattr(storage, "get_bytes", lambda key: b"wav")
    monkeypatch.setattr(storage, "put_bytes", lambda *args: None)
    monkeypatch.setattr(pipeline, "_wav_duration_sec", lambda data: 20)
    monkeypatch.setattr(pipeline, "_progress", AsyncMock())
    monkeypatch.setattr(pipeline, "adapt_uploaded_templates", AsyncMock())
    from src.activities import music_beds
    def music(path, **kwargs):
        path.write_bytes(b"music")
        return {"mood": "documentary", "label": "Bed"}
    monkeypatch.setattr(music_beds, "synthesize_music_bed", music)
    saved = {}
    async def save(ctx, name, value, *args):
        saved[name] = value
    monkeypatch.setattr(pipeline, "_save_artifact", save)
    ctx = {"project_id": "p", "run_id": "r", "format_mode": "documentary", "production_agent_enabled": True,
           "custom_motion_created": three, "disable_overlays": not bool(visual),
           "motion_graphics": preferences or {"mode": "auto"}, "blocklisted_transitions": blocked or []}
    asyncio.run(pipeline.build_timeline(ctx))
    return saved["timeline.v1.json"]


def test_agent_motion_and_text_reach_actual_timeline(monkeypatch):
    manifest = build(monkeypatch, visual={"motion": "slide", "text": "Solar cells"})
    clip = manifest["tracks"]["video"][0]
    assert clip["type"] == "video" and clip["animation"]["in"]["preset"] == "slide"
    overlay = manifest["overlays"][0]
    assert overlay["text"] == "Solar cells"
    assert overlay["start_sec"] + overlay["duration_sec"] <= clip["start_sec"] + clip["duration_sec"]
    from hanuman_timeline_schema import validate_timeline
    validate_timeline(manifest)


def test_scene_grading_is_consistent_across_broll(monkeypatch):
    manifest = build(monkeypatch, broll=True)
    assert manifest["tracks"]["broll"][0]["visual_effects"] == manifest["tracks"]["video"][0]["visual_effects"]


def test_script_retry_reuses_checkpoint_without_model_call(monkeypatch):
    import json
    script = {"language": "en", "sections": [{"id": "s1", "narration": "Cached story."}]}
    monkeypatch.setattr(pipeline, "_progress", AsyncMock())
    monkeypatch.setattr(pipeline, "get_json", lambda key: {"summary": "Evidence"})
    monkeypatch.setattr(pipeline, "read_checkpoint", AsyncMock(return_value=json.dumps(script).encode()))
    monkeypatch.setattr(pipeline, "_save_artifact", AsyncMock())
    forbidden = AsyncMock(side_effect=AssertionError("A completed script must not call the provider again"))
    monkeypatch.setattr(pipeline, "_generate_script_chunk", forbidden)
    result = asyncio.run(pipeline.generate_script({"project_id": "p", "run_id": "r", "production_agent_enabled": True,
        "target_duration_sec": 60, "language": "en", "format_mode": "documentary", "prompt_text": "Solar power"}))
    assert result == script
    forbidden.assert_not_called()
    pipeline._save_artifact.assert_awaited_once()


def test_original_three_split_preserves_visuals_and_coverage(monkeypatch):
    manifest = build(monkeypatch, three=True)
    clips = manifest["tracks"]["video"]
    assert clips[0]["three_scene"]
    assert clips[0]["duration_sec"] == 4
    assert clips[1]["start_sec"] == clips[1]["source_start_sec"] == 4
    assert clips[0]["visual_effects"] == clips[1]["visual_effects"] == {"brightness": 1.1}
    assert inspect_timeline(manifest) == []


def test_selected_policy_filters_stale_original_three(monkeypatch):
    manifest = build(monkeypatch, three=True, preferences={"mode": "selected", "selectedTemplateIds": []})
    assert not any(clip.get("three_scene") for clip in manifest["tracks"]["video"])


def test_blocklisted_transition_cannot_reenter_from_agent_visual_plan(monkeypatch):
    manifest = build(monkeypatch, blocked=["glitch"])
    assert all(t["type"] != "glitch" for t in manifest["transitions"])


def test_disabled_transition_sounds_respected(monkeypatch):
    manifest = build(monkeypatch, preferences={"mode": "auto", "soundEnabled": False})
    assert all(t.get("sfx_muted") is True for t in manifest["transitions"])


def test_director_music_gain_preserves_agent_sound_accents(monkeypatch):
    manifest = build(monkeypatch)
    manifest["tracks"]["music"].append({"id": "agent-sfx", "mood": "sfx", "type": "music", "src": "owned.wav",
        "start_sec": 1, "duration_sec": .5, "volume": .22})
    edited, outcome = apply_decision(manifest, {"action": "set_music_level", "volume": .1})
    assert outcome["status"] == "applied"
    assert edited["tracks"]["music"][0]["volume"] == .1
    assert edited["tracks"]["music"][1]["volume"] == .22
    assert manifest["tracks"]["music"][0]["volume"] != .1
