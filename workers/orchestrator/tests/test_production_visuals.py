import asyncio
import json
import re
from pathlib import Path
from typing import get_args

import pytest

from src.activities import production_visuals as visuals


SECTIONS = {"intro": {}, "context": {}}


def test_catalog_ids_match_actual_editor_and_native_contract():
    root = Path(__file__).resolve().parents[3]
    catalog = json.loads((root / "packages/shared-types/src/visual-filters.json").read_text())
    assert set(get_args(visuals.FilterId)) == {item["id"] for item in catalog}
    source = (root / "packages/shared-types/src/visual-effects.ts").read_text()
    declared_effects = source.split("export const VIDEO_EFFECTS =", 1)[1].split("as const", 1)[0]
    assert set(get_args(visuals.EffectId)) == set(re.findall(r'id: "([^"]+)"', declared_effects))


def test_scene_treatment_preserves_source_and_accepts_real_controls():
    result = visuals.validate_visual_plan({"sections": [{"sectionId": "intro", "transition": "zoom", "visual_effects": {
        "filterId": "cinema", "strength": .4, "effectId": "vignette", "effectStrength": .25}}]}, {}, SECTIONS)
    assert result["sections"]["intro"]["visual_effects"]["filterId"] == "cinema"
    assert result["preview_inspected"] is False
    assert "src" not in result["sections"]["intro"]


@pytest.mark.parametrize("control", [
    {"filterId": "invented"}, {"effectId": "ffmpeg=anything"},
    {"strength": float("nan")}, {"effectStrength": float("inf")},
    {"strength": True}, {"strength": "0.5"}, {"effectStrength": -1},
    {"brightness": 30}, {"saturation": -1}, {"src": "https://arbitrary.example"},
])
def test_invalid_controls_are_rejected(control):
    with pytest.raises(ValueError):
        visuals.validate_visual_plan({"sections": [{"sectionId": "intro", "visual_effects": control}]}, {}, SECTIONS)


@pytest.mark.parametrize("decisions", [
    [{"sectionId": "unknown"}],
    [{"sectionId": "intro"}, {"sectionId": "intro"}],
    [{"sectionId": "intro", "transition": "fade-from-url"}],
    [{"sectionId": "intro", "src": "replacement"}],
])
def test_invalid_scene_identity_and_executable_extra_fields_rejected(decisions):
    with pytest.raises(ValueError):
        visuals.validate_visual_plan({"sections": decisions}, {}, SECTIONS)


def test_user_disable_and_blocklist_are_authoritative():
    raw = {"sections": [{"sectionId": "intro", "transition": "zoom", "visual_effects": {
        "filterId": "cinema", "effectId": "pulse", "effectStrength": .6}}]}
    result = visuals.validate_visual_plan(raw, {"disable_effects": True}, SECTIONS)
    assert result["sections"]["intro"]["transition"] == "cut"
    assert result["sections"]["intro"]["visual_effects"]["filterId"] == "none"
    result = visuals.validate_visual_plan(raw, {"disable_animations": True}, SECTIONS)
    assert result["sections"]["intro"]["visual_effects"]["effectId"] == "none"
    assert result["sections"]["intro"]["visual_effects"]["filterId"] == "cinema"
    with pytest.raises(ValueError, match="blocklisted"):
        visuals.validate_visual_plan(raw, {"blocklisted_transitions": ["zoom"]}, SECTIONS)


@pytest.mark.parametrize("disabled", [False, True])
def test_tool_reads_actual_scenes_and_replays_without_paid_calls(monkeypatch, disabled):
    blobs, saved, calls = {}, {}, []
    script = {"sections": [{"id": "intro", "title": "A start", "narration": "Existing story"}]}
    scenes = {"scenes": [{"id": "scene-intro", "section_id": "intro", "duration_sec": 12, "asset_ref": {"type": "stock_video"}}]}
    monkeypatch.setattr(visuals, "get_json", lambda key: script if key.endswith("script.json") else scenes)
    async def read(key):
        return blobs.get(key)
    async def model(**kwargs):
        evidence = json.loads(kwargs["messages"][1]["content"])
        assert evidence["sections"][0]["asset_type"] == "stock_video"
        calls.append(evidence)
        return json.dumps({"sections": [{"sectionId": "intro", "visual_effects": {"filterId": "documentary"}}]})
    monkeypatch.setattr(visuals, "read_checkpoint", read)
    monkeypatch.setattr(visuals, "chat_completion", model)
    monkeypatch.setattr(visuals, "put_bytes", lambda key, value, mime: blobs.update({key: value}))
    monkeypatch.setattr(visuals, "put_json", lambda key, value: saved.update({key: value}))
    ctx = {"project_id": "p", "run_id": "r", "disable_effects": disabled}
    first = asyncio.run(visuals.direct_visuals(ctx))
    assert asyncio.run(visuals.direct_visuals(ctx)) == first
    assert len(calls) == (0 if disabled else 1)
    assert first["sections"] == 1
    result = next(iter(saved.values()))
    assert result["sections"]["intro"]["visual_effects"]["filterId"] == ("none" if disabled else "documentary")

def test_agent_text_is_bounded_and_respects_disabled_controls():
    clips = [{"id": "a", "scene_id": "scene-intro", "start_sec": 4, "duration_sec": 1.6},
             {"id": "b", "scene_id": "scene-intro", "start_sec": 5.6, "duration_sec": 4}]
    scenes = [{"id": "scene-intro", "section_id": "intro"}]
    decision = {"intro": {"text": "Solar energy"}}
    overlays = visuals.scene_text_overlays(clips, scenes, decision, {})
    assert len(overlays) == 1
    assert overlays[0]["start_sec"] + overlays[0]["duration_sec"] <= 5.6
    assert overlays[0]["transform"]["y"] < 50
    assert visuals.scene_text_overlays(clips, scenes, decision, {"disable_overlays": True}) == []
    assert "animation" not in visuals.scene_text_overlays(clips, scenes, decision, {"disable_animations": True})[0]


def test_motion_and_text_preferences_are_authoritative():
    raw = {"sections": [{"sectionId": "intro", "motion": "slide", "text": "A supported fact"}]}
    value = visuals.validate_visual_plan(raw, {"disable_animations": True, "disable_overlays": True}, SECTIONS)
    assert value["sections"]["intro"]["motion"] == "none"
    assert value["sections"]["intro"]["text"] == ""
