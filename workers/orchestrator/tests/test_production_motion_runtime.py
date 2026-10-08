import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from src.activities import production_motion as motion


def example():
    ctx = {"project_id": "p", "run_id": "r"}
    sections = {"s": {"id": "s", "title": "Solar power", "narration": "Photons release electrons.", "actual_duration_sec": 8}}
    raw = {"sectionId": "s", "html": "<h1>Solar power</h1>", "css": "h1{color:white}", "js": "return gsap.timeline({paused:true});"}
    return ctx, sections, raw, motion.validate_generated_template(raw, ctx, sections)


def test_successful_runtime_does_not_request_unnecessary_repair(monkeypatch):
    ctx, sections, _, template = example()
    check = AsyncMock(return_value={"valid": True})
    repair = AsyncMock(side_effect=AssertionError("Valid graphics need no paid repair"))
    monkeypatch.setattr(motion, "validate_html_runtime", check)
    monkeypatch.setattr(motion, "chat_completion", repair)
    assert asyncio.run(motion.validate_and_repair_templates([template], ctx, sections)) == [template]
    check.assert_awaited_once()
    repair.assert_not_called()


def test_renderer_retry_reuses_existing_design_draft(monkeypatch):
    ctx, sections, _, template = example()
    ctx["motion_graphics"] = {"mode": "custom"}
    async def cache(key):
        return json.dumps([template]).encode() if key.endswith(".draft") else None
    monkeypatch.setattr(motion, "read_checkpoint", cache)
    monkeypatch.setattr(motion, "get_json", lambda key: {"sections": list(sections.values())})
    monkeypatch.setattr(motion, "put_bytes", lambda *args: None)
    monkeypatch.setattr(motion, "put_json", lambda *args: None)
    monkeypatch.setattr(motion, "validate_html_runtime", AsyncMock(return_value={"valid": True}))
    provider = AsyncMock(side_effect=AssertionError("A renderer retry must reuse the design draft"))
    monkeypatch.setattr(motion, "chat_completion", provider)
    result = asyncio.run(motion.create_motion_graphics(ctx))
    assert result["html_runtime_validated"] == 1
    provider.assert_not_called()


def test_actual_tool_error_drives_one_repair_and_revalidation(monkeypatch):
    ctx, sections, raw, template = example()
    check = AsyncMock(side_effect=[{"valid": False, "error": "GSAP timeline was not returned"}, {"valid": True}])
    repair = AsyncMock(return_value=json.dumps(raw))
    monkeypatch.setattr(motion, "validate_html_runtime", check)
    monkeypatch.setattr(motion, "chat_completion", repair)
    result = asyncio.run(motion.validate_and_repair_templates([template], ctx, sections))
    assert result[0]["sectionId"] == "s"
    assert check.await_count == 2 and repair.await_count == 1
    evidence = json.loads(repair.call_args.kwargs["messages"][1]["content"])
    assert evidence["runtime_error"] == "GSAP timeline was not returned"


@pytest.mark.parametrize("changed_scene", [False, True])
def test_failed_or_out_of_scope_repair_refuses_delivery(monkeypatch, changed_scene):
    ctx, sections, raw, template = example()
    if changed_scene:
        raw["sectionId"] = "unrelated"
    monkeypatch.setattr(motion, "validate_html_runtime", AsyncMock(return_value={"valid": False, "error": "Bad code"}))
    repair = AsyncMock(return_value=json.dumps(raw))
    monkeypatch.setattr(motion, "chat_completion", repair)
    with pytest.raises(ValueError):
        asyncio.run(motion.validate_and_repair_templates([template], ctx, sections))
    assert repair.await_count == 1
