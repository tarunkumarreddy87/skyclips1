import copy
import asyncio
import json
import pytest
from src.pipeline.director import apply_decision, inspect_timeline


@pytest.fixture
def timeline():
    return {"metadata": {"duration_sec": 20}, "tracks": {"video": [{"id": "v", "scene_id": "s", "start_sec": 0, "duration_sec": 20}], "broll": [{"id": "b", "scene_id": "s", "start_sec": 5, "duration_sec": 5}], "music": [{"id": "m", "start_sec": 0, "duration_sec": 20, "volume": .3}]}, "settings": {}}


def test_editorial_edit_is_transactional(timeline):
    original = copy.deepcopy(timeline)
    edited, result = apply_decision(timeline, {"action": "place_broll", "clip_id": "b", "start_sec": 12, "duration_sec": 3})
    assert result["status"] == "applied"
    assert edited["tracks"]["broll"][0]["start_sec"] == 12
    assert timeline == original
    assert inspect_timeline(edited) == []


@pytest.mark.parametrize("decision", [
    {"action": "place_broll", "clip_id": "b", "start_sec": 19, "duration_sec": 3},
    {"action": "place_broll", "clip_id": "b", "start_sec": 2, "duration_sec": 10},
    {"action": "remove_broll", "clip_id": "unknown"},
    {"action": "set_music_level", "volume": float("nan")},
    {"action": "set_music_level", "volume": True},
    {"action": "execute_code", "code": "anything"},
])
def test_unsafe_or_unplayable_decisions_rejected(timeline, decision):
    original = copy.deepcopy(timeline)
    with pytest.raises(ValueError):
        apply_decision(timeline, decision)
    assert timeline == original


def test_music_level_updates_both_consumers(timeline):
    edited, _ = apply_decision(timeline, {"action": "set_music_level", "volume": .12})
    assert edited["settings"]["music_volume"] == .12
    assert edited["tracks"]["music"][0]["volume"] == .12


@pytest.mark.parametrize("duration", [0, -1, float("nan"), float("inf"), None, "invalid", True])
def test_review_rejects_invalid_duration_without_crashing(timeline, duration):
    timeline["metadata"]["duration_sec"] = duration
    assert "invalid_duration" in {issue["code"] for issue in inspect_timeline(timeline)}


def test_review_checks_actual_main_track_coverage(timeline):
    timeline["tracks"]["video"] = [
        {"id": "first", "start_sec": 1, "duration_sec": 4},
        {"id": "second", "start_sec": 7, "duration_sec": 4},
        {"id": "third", "start_sec": 10, "duration_sec": 3},
    ]
    codes = [issue["code"] for issue in inspect_timeline(timeline)]
    assert codes.count("video_gap") == 3  # opening, internal and ending gaps
    assert codes.count("video_overlap") == 1


def test_review_tolerates_rounding_and_overlay_overlap(timeline):
    timeline["tracks"]["video"] = [
        {"id": "first", "start_sec": 0, "duration_sec": 10},
        {"id": "second", "start_sec": 10.1, "duration_sec": 9.8},
    ]
    timeline["tracks"]["broll"].append({"id": "overlay", "start_sec": 5, "duration_sec": 5})
    assert inspect_timeline(timeline) == []


def test_review_rejects_duplicate_ids_missing_main_and_bad_audio(timeline):
    timeline["tracks"]["audio"] = [{"id": "b", "start_sec": "broken", "duration_sec": 20}]
    timeline["tracks"]["video"] = []
    codes = {issue["code"] for issue in inspect_timeline(timeline)}
    assert {"duplicate_clip_id", "invalid_timing", "missing_main_video"} <= codes


def test_review_requires_transition_to_reference_exact_nonfinal_clip(timeline):
    timeline["tracks"]["video"] = [
        {"id": "first", "scene_id": "s", "start_sec": 0, "duration_sec": 10},
        {"id": "second", "scene_id": "s", "start_sec": 10, "duration_sec": 10},
    ]
    timeline["transitions"] = [{"id": "transition", "after_clip_id": "first", "duration_sec": .5}]
    assert inspect_timeline(timeline) == []
    for reference in ("s", "deleted-clip", "second"):
        timeline["transitions"][0]["after_clip_id"] = reference
        assert "invalid_transition_reference" in {issue["code"] for issue in inspect_timeline(timeline)}


def test_director_observes_results_and_replays_cached_decisions(timeline, monkeypatch):
    from src.pipeline.director import direct_timeline
    from src.pipeline import storage, checkpoints
    from src.clients import openrouter
    blobs, states, calls = {}, [], []
    async def read(key):
        return blobs.get(key)
    async def model(**kwargs):
        evidence = json.loads(kwargs["messages"][1]["content"])
        calls.append(evidence)
        if not evidence["previous_results"]:
            return json.dumps({"action": "set_music_level", "volume": .1, "reason": "Support narration"})
        assert evidence["previous_results"][0]["result"]["status"] == "applied"
        return '{"action":"finish","reason":"Sufficient"}'
    monkeypatch.setattr(checkpoints, "read_checkpoint", read)
    monkeypatch.setattr(storage, "put_bytes", lambda key, data, content_type: blobs.update({key: data}))
    monkeypatch.setattr(storage, "put_json", lambda key, data: states.append(data))
    monkeypatch.setattr(openrouter, "chat_completion", model)
    ctx = {"project_id": "p", "run_id": "r", "language": "en"}
    first = asyncio.run(direct_timeline(timeline, ctx, []))
    second = asyncio.run(direct_timeline(timeline, ctx, []))
    assert first == second
    assert len(calls) == 2
    assert states[-1]["status"] == "completed"
    assert states[-1]["preview_inspected"] is False
    assert states[-1]["preference_snapshot"]["language"] == "en"
