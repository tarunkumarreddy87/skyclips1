from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.services.editor_agent_service import plan_editor_ops


@pytest.mark.parametrize("speed,expected", [("fast", "test/fast"), ("smart", "test/smart")])
async def test_editor_model_choice_reaches_provider(monkeypatch, speed, expected):
    monkeypatch.setattr(settings, "openrouter_api_key", "test-only-key")
    monkeypatch.setattr(settings, "editor_agent_fast_model", "test/fast")
    monkeypatch.setattr(settings, "editor_agent_smart_model", "test/smart")
    response = MagicMock()
    response.json.return_value = {"choices": [{"message": {"content": '{"reply":"Ready","ops":[]}'}}]}
    client = AsyncMock()
    client.post.return_value = response
    with patch("app.services.editor_agent_service.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        result = await plan_editor_ops(message="Explain this timeline", context={}, speed=speed)
    assert client.post.call_args.kwargs["json"]["model"] == expected
    assert result["ops"] == []


async def test_google_explicit_resource_id_reaches_chat_as_bare_id(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "test-only-key")
    monkeypatch.setattr(settings, "openrouter_base_url", "https://generativelanguage.googleapis.com/v1beta/openai")
    response = MagicMock()
    response.json.return_value = {"choices": [{"message": {"content": '{"reply":"Ready","ops":[]}'}}]}
    client = AsyncMock()
    client.post.return_value = response
    with patch("app.services.editor_models.editor_models", AsyncMock(return_value={
            "models": [{"id": "gemini-3.5-flash-lite", "vision": True}], "visionModel": "gemini-3.5-flash-lite"})), \
         patch("app.services.editor_agent_service.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        result = await plan_editor_ops(message="Explain this timeline", context={}, model_id="models/gemini-3.5-flash-lite")
    assert client.post.call_args.kwargs["json"]["model"] == "gemini-3.5-flash-lite"
    assert result["modelUsed"] == "gemini-3.5-flash-lite"


async def test_text_selection_uses_catalog_vision_fallback_for_evidence(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "test-only-key")
    monkeypatch.setattr(settings, "editor_agent_vision_model", "")
    analysis, plan = MagicMock(), MagicMock()
    analysis.json.return_value = {"choices": [{"message": {"content": "Visible: a red frame."}}]}
    plan.json.return_value = {"choices": [{"message": {"content": '{"reply":"Ready","ops":[]}'}}]}
    client = AsyncMock()
    client.post.side_effect = [analysis, plan]
    frame = {"assetId": "upload-1", "timeMs": 400, "imageUrl": "data:image/jpeg;base64,sampled"}
    with patch("app.services.editor_models.editor_models", AsyncMock(return_value={
            "models": [{"id": "provider/text", "vision": False}, {"id": "provider/vision", "vision": True}],
            "visionModel": "provider/vision"})), patch("app.services.editor_agent_service.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        result = await plan_editor_ops(message="Design this scene", context={"visualEvidence": [frame]}, model_id="provider/text")
    first, second = [call.kwargs["json"] for call in client.post.call_args_list]
    assert first["model"] == "provider/vision" and second["model"] == "provider/text"
    assert any(block.get("image_url", {}).get("url") == frame["imageUrl"] for block in first["messages"][0]["content"])
    assert isinstance(second["messages"][-1]["content"], str)
    assert "base64" not in second["messages"][-1]["content"]
    assert result["visionModelUsed"] == "provider/vision"


async def test_unverified_vision_fallback_is_rejected_before_completion(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "test-only-key")
    client = AsyncMock()
    with patch("app.services.editor_models.editor_models", AsyncMock(return_value={
            "models": [{"id": "provider/text", "vision": False}], "visionModel": "invented/model"})), \
         patch("app.services.editor_agent_service.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        with pytest.raises(ValueError, match="image-capable"):
            await plan_editor_ops(message="Read image", context={}, model_id="provider/text", reference_image_url="https://example.test/image.jpg")
    client.post.assert_not_called()
