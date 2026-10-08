import asyncio
from unittest.mock import AsyncMock

import pytest
from src.clients import language_text
import httpx
from src.clients.openrouter import _retry_delay


def test_provider_cooldown_uses_advertised_retry_delay():
    assert _retry_delay(httpx.Response(429, headers={"Retry-After": "21"})) == 21
    assert _retry_delay(httpx.Response(429, text="Please retry in 19.945s.")) == 19.945
    assert _retry_delay(httpx.Response(429, headers={"Retry-After": "9999"})) == 60
    assert _retry_delay(httpx.Response(429, headers={"Retry-After": "NaN"})) == 0


@pytest.mark.parametrize("response", ['["Namaste"]', '{"texts":["Namaste"]}'])
def test_caption_conversion_accepts_valid_array_or_envelope(monkeypatch, response):
    monkeypatch.setattr(language_text, "chat_completion", AsyncMock(return_value=response))
    assert asyncio.run(language_text.convert_texts(["नमस्ते"], "hi", latin=True)) == ["Namaste"]


@pytest.mark.parametrize("response", ['null', '42', '["Namaste","Extra"]', '{"texts":[null]}'])
def test_caption_conversion_rejects_invalid_shape(monkeypatch, response):
    monkeypatch.setattr(language_text, "chat_completion", AsyncMock(return_value=response))
    with pytest.raises(ValueError, match="incomplete text"):
        asyncio.run(language_text.convert_texts(["नमस्ते"], "hi", latin=True))

def test_caption_repair_only_retries_invalid_entries(monkeypatch):
    import json
    model = AsyncMock(side_effect=['{"texts":["Namaste","दुनिया"]}', '{"texts":["duniya"]}'])
    monkeypatch.setattr(language_text, "chat_completion", model)
    assert asyncio.run(language_text.convert_texts(["नमस्ते", "दुनिया"], "hi", latin=True)) == ["Namaste", "duniya"]
    assert model.await_count == 1


def test_caption_punctuation_does_not_trigger_paid_retry(monkeypatch):
    model = AsyncMock(return_value='{"texts":["Namaste।"]}')
    monkeypatch.setattr(language_text, "chat_completion", model)
    assert asyncio.run(language_text.convert_texts(["नमस्ते।"], "hi", latin=True)) == ["Namaste."]
    assert model.await_count == 1


def test_caption_repair_is_bounded(monkeypatch):
    model = AsyncMock(return_value='{"texts":["नमस्ते"]}')
    monkeypatch.setattr(language_text, "chat_completion", model)
    assert asyncio.run(language_text.convert_texts(["नमस्ते"], "hi", latin=True)) == ["namaste"]
    assert model.await_count == 1

@pytest.mark.parametrize("text", ["नमस्ते दुनिया।", "తెలుగు భాష", "தமிழ்", "ಕನ್ನಡ", "മലയാളം", "বাংলা", "ગુજરાતી", "ਪੰਜਾਬੀ", "ଓଡ଼ିଆ", "१२३", "Hello నమస్తే 2026!"])
def test_all_supported_caption_scripts(text):
    result = language_text.latin_spelling(text)
    assert result.strip()
    assert not any(0x900 <= ord(c) <= 0xd7f for c in result)
    if text.startswith("Hello"):
        assert result.startswith("Hello ") and result.endswith(" 2026!")
