import asyncio
import copy
import io
import json
import struct
import wave
from unittest.mock import AsyncMock

from src.activities import pipeline
from src.clients import language_text


def test_story_role_overrides_legacy_outro_id_and_titles_are_not_keywords():
    sections = [{"id": "intro", "story_role": "opening"}, {"id": "ending", "story_role": "closing"},
                {"id": "outro", "story_role": "body"}, {"id": "chapter", "title": "A conclusion about history"}]
    assert [s["id"] for s in pipeline._order_story_sections(sections)] == ["intro", "outro", "chapter", "ending"]
    normalized = pipeline._normalize_script_sections([{"id": "body", "narration": "Relevant evidence.", "story_role": "body"}])
    assert normalized[0]["story_role"] == "body"


def test_cached_script_reorders_extension_before_outro_without_llm(monkeypatch):
    cached = {"sections": [{"id": "intro"}, {"id": "outro"}, {"id": "extension"}], "language": "en"}
    monkeypatch.setattr(pipeline, "_progress", AsyncMock())
    monkeypatch.setattr(pipeline, "get_json", lambda key: {"summary": "Evidence"})
    monkeypatch.setattr(pipeline, "read_checkpoint", AsyncMock(return_value=json.dumps(cached).encode()))
    model = AsyncMock(side_effect=AssertionError("Cached script must not regenerate"))
    monkeypatch.setattr(pipeline, "_generate_script_chunk", model)
    monkeypatch.setattr(pipeline, "_save_artifact", AsyncMock())
    result = asyncio.run(pipeline.generate_script({"project_id": "p", "run_id": "r", "format_mode": "documentary",
        "language": "en", "production_agent_enabled": True, "target_duration_sec": 30, "prompt_text": "History"}))
    assert [s["id"] for s in result["sections"]] == ["intro", "extension", "outro"]
    model.assert_not_called()


def wav(marker, seconds):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(1); writer.setsampwidth(2); writer.setframerate(8000)
        writer.writeframes(struct.pack("<h", marker) * round(seconds * 8000))
    return buffer.getvalue()


def test_main_agent_honors_approved_length_over_prompt_hint():
    assert pipeline._resolve_target_duration({"production_agent_enabled": True,
        "target_duration_sec": 300, "prompt_text": "Create a 10-minute documentary"}) == 300


def test_voice_topup_matches_script_audio_and_segment_order(monkeypatch):
    script = {"language": "en", "target_duration_sec": 30, "sections": [
        {"id": "intro", "narration": "Opening.", "story_role": "opening"},
        {"id": "outro", "narration": "Closing.", "story_role": "closing"}]}
    store = {"projects/p/runs/r/script.json": script, "projects/p/runs/r/research.json": {"summary": "Source"}}
    monkeypatch.setattr(pipeline.settings, "hanuman_stub_mode", False)
    monkeypatch.setattr(pipeline.settings, "allow_silent_tts_fallback", False)
    monkeypatch.setattr(language_text, "narration_matches", lambda *args: True)
    monkeypatch.setattr(pipeline, "get_json", lambda key: copy.deepcopy(store[key]))
    monkeypatch.setattr(pipeline, "put_json", lambda key, value: store.update({key: copy.deepcopy(value)}))
    monkeypatch.setattr(pipeline, "put_bytes", lambda key, value, mime: store.update({key: value}))
    monkeypatch.setattr(pipeline, "_progress", AsyncMock())
    monkeypatch.setattr(pipeline, "_save_artifact", AsyncMock())
    audio = {"Opening.": wav(1000, 5), "Closing.": wav(2000, 5), "More evidence.": wav(3000, 20)}
    async def synth(**kwargs): return audio[kwargs["text"]]
    monkeypatch.setattr(pipeline, "synthesize_speech_stream", synth)
    async def checkpoint(key, factory, **kwargs): return await factory()
    monkeypatch.setattr(pipeline, "checkpointed_bytes", checkpoint)
    extra = AsyncMock(return_value=[{"id": "topup", "narration": "More evidence.", "story_role": "body"}])
    monkeypatch.setattr(pipeline, "_generate_script_chunk", extra)
    merge_orders = []
    def merge(keys):
        merge_orders.append(list(keys))
        return pipeline._concat_wav_bytes([store[key] for key in keys])
    monkeypatch.setattr(pipeline, "_merge_wav_from_keys", merge)
    result = asyncio.run(pipeline.generate_voice({"project_id": "p", "run_id": "r", "language": "en",
        "format_mode": "documentary", "production_agent_enabled": True, "prompt_text": "History"}))
    # Fill only the measured 20-second gap, without the old 60-second floor
    # plus 30-second padding; scale the word budget to this actual voice.
    assert extra.call_args.kwargs["target_sec"] == 20
    assert extra.call_args.kwargs["target_narration_chars"] == 40
    assert [s["id"] for s in store["projects/p/runs/r/script.json"]["sections"]] == ["intro", "topup", "outro"]
    assert [s["section_id"] for s in result["segments"]] == ["intro", "topup", "outro"]
    assert [key.rsplit("/", 1)[-1] for key in merge_orders[-1]] == ["intro.wav", "topup.wav", "outro.wav"]
    with wave.open(io.BytesIO(store[result["narration_key"]]), "rb") as reader:
        samples = reader.readframes(reader.getnframes())
        for seconds, marker in [(1, 1000), (6, 3000), (26, 2000)]:
            assert struct.unpack_from("<h", samples, seconds * 8000 * 2)[0] == marker
    assert result["voice_topup_passes"] == 1
