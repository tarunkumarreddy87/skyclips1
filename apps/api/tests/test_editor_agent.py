"""Structural TTS ban + allow-list for editor agent planner."""

import asyncio

from app.services.editor_agent_normalize import normalize_ops
from app.services.editor_agent_service import ALLOWED_OPS, BANNED_SUBSTRINGS, plan_editor_ops, _validate_edit_op
import pytest


def test_allowed_ops_exclude_tts_and_narration() -> None:
    blob = " ".join(ALLOWED_OPS).lower()
    assert "narrat" not in blob
    assert "voice" not in blob
    assert "tts" not in blob
    for banned in (
        "regenerate_voice",
        "update_narration",
        "replace_narration",
        "synthesize_speech",
        "change_voice",
    ):
        assert banned not in ALLOWED_OPS


def test_banned_substrings_cover_voice_generation() -> None:
    assert "voice" in BANNED_SUBSTRINGS
    assert "tts" in BANNED_SUBSTRINGS


def test_plan_refuses_voiceover_without_llm() -> None:
    result = asyncio.run(
        plan_editor_ops(message="regenerate the voiceover to sound excited", context={})
    )
    assert result["refused"] is True
    assert result["ops"] == []
    assert "voiceover" in result["reply"].lower() or "narration" in result["reply"].lower()


def test_normalize_maps_llm_aliases() -> None:
    ops = normalize_ops(
        [
            {"op": "set_transition", "item_id": "clip-0", "type": "glitch"},
            {"op": "add_animation", "preset": "subscribe-cta", "start_ms": 5000},
        ]
    )
    assert ops[0]["op"] == "add_transition"
    assert ops[0]["afterItemId"] == "clip-0"
    assert ops[0]["type"] == "glitch"
    assert ops[1]["op"] == "add_animation"
    assert ops[1]["startMs"] == 5000


def test_invalid_model_payloads_are_rejected_before_application() -> None:
    for raw in [
        {"op": "trim_item", "itemId": "video", "startMs": 2000, "endMs": 1000},
        {"op": "set_volume", "itemId": "audio", "volume": float("nan")},
        {"op": "add_transition", "itemId": "clip", "durationMs": "fast"},
        {"op": "add_transition", "itemId": "clip", "type": "invented"},
        {"op": "replace_media", "itemId": "clip", "url": "javascript:alert(1)"},
        {"op": "set_keyframes", "itemId": "graphic", "keyframes": [{"time_sec": 1}, {"time_sec": 0}]},
        {"op": "set_caption_style", "style": "imaginary"},
        {"op": "add_sfx", "preset": "made_up"},
    ]:
        try:
            ops = normalize_ops([raw])
        except (ValueError, TypeError):
            continue
        if ops:
            with pytest.raises((ValueError, TypeError)):
                _validate_edit_op(ops[0], {})


def test_premium_graphic_and_original_sound_commands_survive_normalization() -> None:
    raw = [
        {"op": "set_caption_style", "style": "cinematic"},
        {"op": "add_graphic", "type": "bar_chart", "data": [{"label": "2024", "value": 42}], "duration_ms": 5000},
        {"op": "set_keyframes", "item_id": "frame", "keyframes": [{"time_sec": 0, "x": 20, "opacity": 0}, {"time_sec": 2, "x": 70, "opacity": 1}]},
        {"op": "add_sfx", "preset": "soft_whoosh", "start_ms": 1400},
        {"op": "update_settings", "patch": {"narrationVolume": 0.8, "clipAudioVolume": 1, "captionStyle": "editorial"}},
    ]
    ops = normalize_ops(raw)
    assert len(ops) == 5
    assert ops[1]["data"] == [{"label": "2024", "value": 42}]
    assert ops[2]["itemId"] == "frame"
    assert ops[3]["preset"] == "soft_whoosh"
    assert ops[4]["patch"]["narrationVolume"] == 0.8


def test_chart_requires_supplied_valid_data_and_bounded_keyframes() -> None:
    assert normalize_ops([
        {"op": "add_graphic", "type": "bar_chart"},
        {"op": "add_graphic", "type": "bar_chart", "data": [{"label": "A", "value": -1}]},
        {"op": "add_graphic", "type": "frame", "durationMs": 1000, "keyframes": [{"time_sec": 2, "x": 20}]},
        {"op": "set_keyframes", "itemId": "frame", "keyframes": [{"time_sec": 0, "opacity": 4}]},
    ]) == []


def test_narration_mixing_is_an_edit_not_voice_regeneration() -> None:
    from app.services.editor_agent_service import TTS_USER_RE
    assert not TTS_USER_RE.search("Lower narration volume and fade it out")
    assert not TTS_USER_RE.search("Move the voiceover clip to 2 seconds")
    assert TTS_USER_RE.search("regenerate the narration")
    assert normalize_ops([{ "op": "set_volume", "itemId": "narration-1", "volume": 0.5 }]) == [{"op": "set_volume", "itemId": "narration-1", "volume": 0.5}]


def test_existing_narration_audio_edits_remain_available() -> None:
    context = {"items": [{"id": "narration", "type": "narration", "locked": False}]}
    for op in [{"op": "set_volume", "itemId": "narration", "volume": 0.6}, {"op": "trim_item", "itemId": "narration", "startMs": 0, "endMs": 2400}]:
        _validate_edit_op(op, context)
    context["items"][0]["locked"] = True
    with pytest.raises(ValueError, match="locked"):
        _validate_edit_op({"op": "delete_item", "itemId": "narration"}, context)


def test_keyframe_limit_and_invalid_graphic_fields_are_rejected() -> None:
    assert normalize_ops([{"op": "set_keyframes", "itemId": "frame", "keyframes": [{"time_sec": index / 10} for index in range(101)]}]) == []
    assert normalize_ops([{"op": "update_graphic", "itemId": "frame", "patch": {"transform": {"x": float("nan")}}}]) == []


@pytest.mark.parametrize("prompt", ["change narration volume to 60%", "change voiceover volume to 60%", "trim the narration clip", "move voiceover to two seconds"])
def test_audio_edit_requests_do_not_trigger_speech_generation_refusal(prompt: str) -> None:
    from app.services.editor_agent_service import TTS_USER_RE
    assert TTS_USER_RE.search(prompt) is None
