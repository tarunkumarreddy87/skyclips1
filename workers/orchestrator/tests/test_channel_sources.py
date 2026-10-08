import asyncio
import base64
import pytest
from src.clients.language_text import narration_matches, convert_texts
from src.clients import image_generation, language_text


def test_language_mismatch_is_detected():
    assert narration_matches("తెలుగు కథ", "te")
    assert not narration_matches("తెలుగు కథ", "en")
    assert not narration_matches("An English story", "te")
    assert narration_matches("An English story", "en-IN")


def test_caption_conversion_preserves_entries_and_repairs_native_script(monkeypatch):
    async def reply(**kwargs):
        return '{"texts":["Telugu katha", "Mana prapancham"]}'
    monkeypatch.setattr(language_text, "chat_completion", reply)
    assert asyncio.run(convert_texts(["తెలుగు కథ", "మన ప్రపంచం"], "te", latin=True)) == ["Telugu katha", "Mana prapancham"]
    async def wrong(**kwargs):
        return '{"texts":["తెలుగు కథ"]}'
    monkeypatch.setattr(language_text, "chat_completion", wrong)
    assert asyncio.run(convert_texts(["తెలుగు కథ"], "te", latin=True)) == ["telugu katha"]


def test_image_request_uses_selected_model_and_decodes_response(monkeypatch):
    monkeypatch.setattr(image_generation.settings, "openrouter_image_api_key", "test")
    class Response:
        status_code = 200
        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"image").decode(), "media_type": "image/png"}]}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            assert kwargs["json"]["model"] == "chosen/model"
            assert kwargs["json"]["aspect_ratio"] == "16:9"
            return Response()
    monkeypatch.setattr(image_generation.httpx, "AsyncClient", Client)
    assert asyncio.run(image_generation.generate_scene_image("chosen/model", "Scene one")) == (b"image", "image/png")


def test_short_json_language_conversion_is_a_valid_completion():
    from src.clients.openrouter import _is_useless_completion
    text = '{"texts":["A short story"]}'
    assert _is_useless_completion(text, "text-model", min_content_chars=1) is None
    assert _is_useless_completion(text, "text-model") is not None
