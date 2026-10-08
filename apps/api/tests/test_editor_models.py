"""Provider catalog contracts; mock HTTP only, no model completions."""
import httpx
import pytest

from app.config import settings
from app.services import editor_models as module


@pytest.fixture(autouse=True)
def isolate_catalog(monkeypatch):
    monkeypatch.setattr(module, "_cache", {})
    monkeypatch.setattr(settings, "openrouter_api_key", "catalog-test-key")
    monkeypatch.setattr(settings, "openrouter_base_url", "https://generativelanguage.googleapis.com/v1beta/openai")
    monkeypatch.setattr(settings, "openrouter_model", "gemini-3.5-flash-lite")
    monkeypatch.setattr(settings, "editor_agent_fast_model", "")
    monkeypatch.setattr(settings, "editor_agent_vision_model", "")


def mock_http(monkeypatch, handle):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, "AsyncClient", lambda **kwargs: real_client(
        transport=httpx.MockTransport(handle), **kwargs))


async def test_google_catalog_auth_resource_ids_and_native_chat_metadata(monkeypatch):
    requests = []
    def handle(request):
        requests.append(request)
        assert "catalog-test-key" not in str(request.url)
        if request.url.path.endswith("/openai/models"):
            assert request.headers["Authorization"] == "Bearer catalog-test-key"
            return httpx.Response(200, json={"data": [
                {"id": "models/gemini-3.5-flash-lite", "display_name": "Gemini Flash Lite", "owned_by": "google"},
                {"id": "models/gemma-3-27b-it", "display_name": "Gemma"},
                {"id": "models/gemini-embedding-001"},
                {"id": "models/gemini-2.5-flash-image"},
                {"id": "models/gemini-2.5-flash-special"},
            ]})
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.url.path == "/v1beta/models"
        assert request.headers["x-goog-api-key"] == "catalog-test-key"
        assert "Authorization" not in request.headers
        return httpx.Response(200, json={"models": [
            {"name": "models/gemini-3.5-flash-lite", "inputTokenLimit": 1048576,
             "supportedGenerationMethods": ["generateContent", "countTokens"]},
            {"name": "models/gemma-3-27b-it", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.5-flash-special", "supportedGenerationMethods": ["embedContent"]},
        ]})
    mock_http(monkeypatch, handle)
    catalog = await module.editor_models()
    assert len(requests) == 2
    assert [row["id"] for row in catalog["models"]] == ["gemini-3.5-flash-lite", "gemma-3-27b-it"]
    assert catalog["defaultModel"] == catalog["visionModel"] == "gemini-3.5-flash-lite"
    assert catalog["models"][0] == {"id": "gemini-3.5-flash-lite", "name": "Gemini Flash Lite",
        "vision": True, "contextLength": 1048576, "structured": True}
    assert catalog["models"][1]["vision"] is False
    assert module.normalize_model_id("models/gemini-3.5-flash-lite") == "gemini-3.5-flash-lite"


async def test_openrouter_modalities_names_and_parameters_are_preserved(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_base_url", "https://openrouter.ai/api/v1")
    def handle(request):
        assert request.url.path == "/api/v1/models"
        assert request.headers["Authorization"] == "Bearer catalog-test-key"
        return httpx.Response(200, json={"data": [
            {"id": "models/text-model", "name": "Text", "context_length": 8000,
             "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}},
            {"id": "provider/vision", "name": "Vision", "context_length": 128000,
             "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]},
             "supported_parameters": ["response_format"]},
            {"id": "provider/image", "architecture": {"output_modalities": ["image"]}},
        ]})
    mock_http(monkeypatch, handle)
    catalog = await module.editor_models()
    assert catalog["models"] == [
        {"id": "models/text-model", "name": "Text", "contextLength": 8000, "vision": False, "structured": False},
        {"id": "provider/vision", "name": "Vision", "contextLength": 128000, "vision": True, "structured": True},
    ]
    assert catalog["visionModel"] == "provider/vision"
    assert module.normalize_model_id("models/text-model") == "models/text-model"


async def test_catalog_cache_is_scoped_to_provider_and_credentials(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_base_url", "https://provider-a.test/v1")
    calls = []
    def handle(request):
        calls.append((request.url.host, request.headers["Authorization"]))
        return httpx.Response(200, json={"data": [{"id": f"{request.url.host}/{len(calls)}"}]})
    mock_http(monkeypatch, handle)
    first = await module.editor_models()
    assert await module.editor_models() == first
    monkeypatch.setattr(settings, "openrouter_base_url", "https://provider-b.test/v1")
    second = await module.editor_models()
    monkeypatch.setattr(settings, "openrouter_api_key", "other-catalog-key")
    third = await module.editor_models()
    assert len(calls) == 3
    assert first["models"] != second["models"] != third["models"]
    assert "catalog-test-key" not in repr(module._cache) and "other-catalog-key" not in repr(module._cache)


@pytest.mark.parametrize("status", [401, 404, 429])
async def test_compatible_provider_errors_remain_errors(monkeypatch, status):
    mock_http(monkeypatch, lambda request: httpx.Response(status, json={"error": "Unavailable"}))
    with pytest.raises(httpx.HTTPStatusError) as error:
        await module.editor_models()
    assert error.value.response.status_code == status
    assert not module._cache


async def test_optional_google_metadata_failure_keeps_verified_compatible_ids(monkeypatch):
    monkeypatch.setattr(settings, "editor_agent_vision_model", "not-a-hosted-model")
    def handle(request):
        if request.url.path.endswith("/openai/models"):
            return httpx.Response(200, json={"data": [{"id": "models/gemini-2.5-flash"},
                {"id": "models/gemini-2.5-pro", "architecture": {"input_modalities": ["text"]}},
                {"id": "models/gemini-2.5-flash-preview-tts"}]})
        return httpx.Response(403)
    mock_http(monkeypatch, handle)
    catalog = await module.editor_models()
    assert catalog["visionModel"] == "gemini-2.5-flash"
    assert [row["id"] for row in catalog["models"]] == ["gemini-2.5-flash", "gemini-2.5-pro"]
    assert catalog["models"][1]["vision"] is False
