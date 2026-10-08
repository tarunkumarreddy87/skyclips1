import asyncio
import io
import json
import wave
from unittest.mock import AsyncMock

import pytest
from src.activities import production_sound as sound


@pytest.mark.parametrize("preset,duration", sound.PRESETS.items())
def test_original_wavs_have_real_duration_and_samples(preset, duration):
    data = sound.synthesize_sound(preset)
    assert data == sound.synthesize_sound(preset)
    with wave.open(io.BytesIO(data), "rb") as reader:
        assert reader.getnchannels() == 1
        assert reader.getsampwidth() == 2
        assert reader.getnframes() / reader.getframerate() == pytest.approx(duration)
        assert any(reader.readframes(reader.getnframes()))


@pytest.mark.parametrize("change", [
    {"sectionId": "invented"}, {"sound": "https://bad/audio.wav"}, {"at_sec": -1},
    {"at_sec": 3.9}, {"at_sec": float("nan")}, {"volume": float("inf")},
    {"volume": .8}, {"volume": True},
])
def test_rejects_unsafe_model_sound_choices(change):
    cue = {"sectionId": "s1", "sound": "whoosh", "at_sec": .1, "volume": .2} | change
    with pytest.raises(ValueError):
        sound.validate_cues([cue], {"s1": {"actual_duration_sec": 4}})


def test_sparse_budget():
    with pytest.raises(ValueError):
        sound.validate_cues([{}] * 13, {})


def test_retry_uses_checkpoint_and_owns_every_asset(monkeypatch):
    stored = {}
    monkeypatch.setattr(sound, "get_json", lambda key: {"sections": [{"id": "s1", "actual_duration_sec": 4}]})
    monkeypatch.setattr(sound, "put_bytes", lambda key, data, mime: stored.update({key: data}))
    monkeypatch.setattr(sound, "put_json", lambda key, data: stored.update({key: data}))
    async def checkpoint(key):
        return stored.get(key)
    monkeypatch.setattr(sound, "read_checkpoint", checkpoint)
    model = AsyncMock(return_value=json.dumps({"cues": [{"sectionId": "s1", "sound": "tick", "at_sec": .5, "volume": .15}]}))
    monkeypatch.setattr(sound, "chat_completion", model)
    ctx = {"project_id": "p1", "run_id": "r1", "production_plan": {"soundDirection": "gentle chapter ticks"}}
    first = asyncio.run(sound.design_sound(ctx))
    assert asyncio.run(sound.design_sound(ctx)) == first
    assert model.await_count == 1
    cues = stored["projects/p1/runs/r1/agent-sound-plan.json"]["cues"]
    assert cues[0]["src"] == "projects/p1/runs/r1/sound/motion-tick.wav"
    assert cues[0]["src"] in stored
    assert cues[0]["at_sec"] == .5


def test_disabled_sound_never_calls_model(monkeypatch):
    model = AsyncMock()
    stored = {}
    monkeypatch.setattr(sound, "chat_completion", model)
    monkeypatch.setattr(sound, "put_json", lambda key, value: stored.update({key: value}))
    result = asyncio.run(sound.design_sound({"project_id": "p", "run_id": "r", "motion_graphics": {"soundEnabled": False}}))
    assert result["disabled"] and list(stored.values()) == [{"cues": []}]
    model.assert_not_called()
