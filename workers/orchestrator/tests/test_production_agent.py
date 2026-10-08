import asyncio
import json
import pytest
from src.activities.production_agent import available_tools, choose_production_tool
from src.activities.production_motion import validate_generated_template
from src.pipeline.motion_policy import approved_templates, builtin_enabled, custom_allowed


def history(*names):
    return [{"tool": name, "status": "completed", "result": {}} for name in names]


def test_dependencies_and_single_script_revision():
    ctx = {}
    assert available_tools(ctx, []) == ["validate_brief"]
    assert available_tools(ctx, history("validate_brief")) == ["plan_production"]
    assert available_tools(ctx, history("validate_brief", "plan_production")) == ["run_research"]
    done = history("validate_brief", "plan_production", "run_research", "generate_script")
    assert set(available_tools(ctx, done)) == {"generate_voice", "generate_script"}
    assert available_tools(ctx, done + history("generate_script")) == ["generate_voice"]
    assert "generate_script" not in available_tools(ctx, done + history("generate_voice"))


def test_uploaded_script_and_mandatory_review():
    assert available_tools({"entry_path": "script_first"}, history("validate_brief", "plan_production")) == ["parse_script"]
    done = history("validate_brief", "plan_production", "parse_script", "generate_voice", "plan_scenes", "design_sound", "direct_visuals", "build_timeline")
    assert available_tools({"entry_path": "script_first"}, done) == ["review_timeline"]
    assert available_tools({"entry_path": "script_first"}, done + history("review_timeline")) == ["complete_timeline"]
    assert available_tools({}, history("complete_timeline")) == ["finish"]


def test_custom_required_auto_optional_selected_forbids_generation():
    done = history("validate_brief", "plan_production", "run_research", "generate_script", "generate_voice", "plan_scenes", "design_sound", "direct_visuals")
    assert available_tools({"motion_graphics": {"mode": "custom"}}, done) == ["create_motion_graphics"]
    assert set(available_tools({"motion_graphics": {"mode": "auto"}}, done)) == {"build_timeline", "create_motion_graphics"}
    assert available_tools({"motion_graphics": {"mode": "selected"}}, done) == ["build_timeline"]
    assert available_tools({"motion_graphics": {"mode": "custom"}}, done + history("create_motion_graphics")) == ["build_timeline"]


def test_user_allowlist_overrides_model_preferences():
    templates = [{"id": "yes", "aiEnabled": True}, {"id": "no", "aiEnabled": True}, {"id": "disabled", "aiEnabled": False}]
    ctx = {"uploaded_templates": templates, "motion_graphics": {"mode": "selected", "selectedTemplateIds": ["yes"]}}
    assert approved_templates(ctx) == [templates[0]]
    assert approved_templates({**ctx, "motion_graphics": {"mode": "none"}}) == []
    assert not custom_allowed(ctx)
    assert not builtin_enabled({**ctx, "motion_graphics": {**ctx["motion_graphics"], "enabled": True, "templateId": "press-cutout-v1"}})


def test_single_prerequisite_has_no_paid_model_call(monkeypatch):
    import src.activities.production_agent as module
    async def forbidden(**kwargs):
        raise AssertionError("No model required for deterministic prerequisite")
    async def cache(key): return None
    monkeypatch.setattr(module, "chat_completion", forbidden)
    monkeypatch.setattr(module, "read_checkpoint", cache)
    monkeypatch.setattr(module, "put_json", lambda *args: None)
    result = asyncio.run(choose_production_tool({"ctx": {"project_id": "p", "run_id": "r"}, "history": []}))
    assert result["tool"] == "validate_brief"


def test_agent_uses_evidence_and_replays_decision(monkeypatch):
    import src.activities.production_agent as module
    blobs, calls = {}, []
    async def cache(key): return blobs.get(key)
    async def model(**kwargs):
        calls.append(json.loads(kwargs["messages"][1]["content"]))
        return '{"tool":"generate_script","reason":"Remove repeated opening and clarify chronology"}'
    monkeypatch.setattr(module, "chat_completion", model)
    monkeypatch.setattr(module, "read_checkpoint", cache)
    monkeypatch.setattr(module, "get_json", lambda *args: {"sections": [{"narration": "Actual narration"}]})
    monkeypatch.setattr(module, "put_bytes", lambda key, data, mime: blobs.update({key: data}))
    monkeypatch.setattr(module, "put_json", lambda *args: None)
    payload = {"ctx": {"project_id": "p", "run_id": "r", "language": "en"}, "history": history("validate_brief", "plan_production", "run_research", "generate_script")}
    assert asyncio.run(choose_production_tool(payload)) == asyncio.run(choose_production_tool(payload))
    assert len(calls) == 1
    assert "Actual narration" in calls[0]["evidence"]["script.json"]


@pytest.mark.parametrize("patch", [{"html": "<script>bad</script>"}, {"js": "fetch('remote'); return gsap.timeline();"}, {"sectionId": "invented"}, {"css": "@import 'remote';"}])
def test_unsafe_original_graphics_rejected(patch):
    value = {"sectionId": "s", "html": "<h1 data-bind='title'>History</h1>", "css": "h1{color:white}", "js": "return gsap.timeline({paused:true});", **patch}
    with pytest.raises(ValueError): validate_generated_template(value, {"project_id": "p", "run_id": "r"}, {"s": {"actual_duration_sec": 8}})


def test_original_graphic_is_stable_and_uses_scene_duration():
    value = {"sectionId": "s", "html": "<h1>History</h1>", "css": "h1{color:white}", "js": "return gsap.timeline({paused:true});"}
    ctx = {"project_id": "p", "run_id": "r", "motion_graphics": {"soundEnabled": False}}
    first = validate_generated_template(value, ctx, {"s": {"actual_duration_sec": 4}})
    assert first == validate_generated_template(value, ctx, {"s": {"actual_duration_sec": 4}})
    assert first["durationSec"] == 4 and first["audioCues"] == []


@pytest.mark.parametrize("js", ["(root, gsap, data) => {return gsap.timeline({paused:true});}",
    "function(root, gsap, data) {return gsap.timeline({paused:true});}"])
def test_original_factory_expression_is_invoked(js):
    result = validate_generated_template({"sectionId": "s", "html": "<h1>Solar power</h1>", "css": "h1{color:white}", "js": js},
        {"project_id": "p", "run_id": "r"}, {"s": {"actual_duration_sec": 8}})
    assert result["js"] == f"return ({js})(root, gsap, data, assets);"


@pytest.mark.parametrize("mode,chosen,parallel", [("custom", "direct_visuals", ["create_motion_graphics"]),
    ("auto", "direct_visuals", None), ("auto", "create_motion_graphics", ["direct_visuals"])])
def test_independent_graphics_and_grading_parallelism_respects_agent_choice(monkeypatch, mode, chosen, parallel):
    import src.activities.production_agent as module
    async def cache(key): return None
    async def model(**kwargs): return json.dumps({"tool": chosen, "reason": "Explain the scene"})
    monkeypatch.setattr(module, "read_checkpoint", cache)
    monkeypatch.setattr(module, "chat_completion", model)
    monkeypatch.setattr(module, "get_json", lambda *args: {})
    monkeypatch.setattr(module, "put_bytes", lambda *args: None)
    monkeypatch.setattr(module, "put_json", lambda *args: None)
    result = asyncio.run(choose_production_tool({"ctx": {"project_id": "p", "run_id": "r", "motion_graphics": {"mode": mode}},
        "history": history("validate_brief", "plan_production", "run_research", "generate_script", "generate_voice", "plan_scenes", "design_sound")}))
    assert result.get("parallel_tools") == parallel


def test_original_graphics_fit_provider_budget(monkeypatch):
    import src.activities.production_motion as module
    requests = []
    async def model(**kwargs):
        requests.append(kwargs)
        return json.dumps({"templates": [{"sectionId": "s", "html": "<h1>Solar power</h1>",
            "css": "h1{color:white}", "js": "return gsap.timeline({paused:true});"}]})
    async def cache(key): return None
    monkeypatch.setattr(module, "chat_completion", model)
    monkeypatch.setattr(module, "read_checkpoint", cache)
    async def runtime(template, section): return {"valid": True}
    monkeypatch.setattr(module, "validate_html_runtime", runtime)
    monkeypatch.setattr(module, "get_json", lambda key: {"sections": [{"id": "s", "actual_duration_sec": 8}]})
    monkeypatch.setattr(module, "put_bytes", lambda *args: None)
    monkeypatch.setattr(module, "put_json", lambda *args: None)
    result = asyncio.run(module.create_motion_graphics({"project_id": "p", "run_id": "r", "motion_graphics": {"mode": "custom"}}))
    assert result["templates"] == 1
    assert requests[0]["max_tokens"] <= 3000
    assert "exactly one" in requests[0]["messages"][0]["content"]
