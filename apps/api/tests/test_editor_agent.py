"""Structural TTS ban + allow-list for editor agent planner."""

import asyncio

from app.services.editor_agent_normalize import normalize_ops
from app.services.editor_agent_service import ALLOWED_OPS, BANNED_SUBSTRINGS, plan_editor_ops


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


def test_banned_substrings_cover_voice_family() -> None:
    assert "narrat" in BANNED_SUBSTRINGS
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
