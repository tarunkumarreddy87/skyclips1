"""Exercise production orchestration without paid APIs or a Temporal server."""
import asyncio
import pytest

from src.activities.production_agent import available_tools
from src.workflows.video_generation import VideoGenerationWorkflow, workflow


@pytest.mark.parametrize("entry_path", ["prompt_first", "script_first"])
def test_production_dependencies_and_user_owned_final_render(monkeypatch, entry_path):
    calls = []
    decisions = []
    async def execute(function, payload, **options):
        name = function if isinstance(function, str) else function.__name__
        if name == "choose_production_tool":
            allowed = available_tools(payload["ctx"], payload["history"])
            assert allowed
            chosen = allowed[0]
            decisions.append((chosen, payload))
            return {"tool": chosen, "reason": "Verified test decision"}
        calls.append(name)
        if name == "plan_production":
            return {"storyDirection": "Explain the evidence"}
        if name == "build_timeline":
            return {"timeline_key": "project/run/timeline.v1.json"}
        return {"status": "completed"}
    monkeypatch.setattr(workflow, "patched", lambda name: True)
    monkeypatch.setattr(workflow, "execute_activity", execute)
    monkeypatch.setattr(workflow, "start_activity", lambda function, payload, **options: asyncio.create_task(execute(function, payload, **options)))
    result = asyncio.run(VideoGenerationWorkflow().run({
        "run_id": "run", "project_id": "project", "entry_path": entry_path,
        "production_agent_enabled": True, "target_duration_sec": 300,
        "motion_graphics": {"mode": "none"},
    }))
    script_tool = "parse_script" if entry_path == "script_first" else "generate_script"
    expected = ["validate_brief", "plan_production"]
    if entry_path == "prompt_first":
        expected.append("run_research")
    expected += [script_tool, "generate_voice", "plan_scenes", "design_sound", "direct_visuals", "build_timeline", "review_timeline", "complete_timeline"]
    assert calls == expected
    assert result == "project/run/timeline.v1.json"
    assert decisions[-1][0] == "finish"
    assert all(call not in {"render_video", "complete_run"} for call in calls)
    assert decisions[2][1]["ctx"]["production_plan"]["storyDirection"] == "Explain the evidence"


def test_production_fails_instead_of_accepting_unknown_tools(monkeypatch):
    calls = []
    async def execute(function, payload, **options):
        name = function.__name__
        calls.append((name, payload))
        return {"tool": "render_video", "reason": "Invalid automatic final render"}
    monkeypatch.setattr(workflow, "patched", lambda name: True)
    monkeypatch.setattr(workflow, "execute_activity", execute)
    with pytest.raises(ValueError, match="Unknown production tool"):
        asyncio.run(VideoGenerationWorkflow().run({
            "project_id": "project", "run_id": "run", "production_agent_enabled": True,
        }))
    assert [name for name, _ in calls] == ["choose_production_tool", "fail_run"]
    assert calls[-1][1]["stage"] == "production_agent"


def test_custom_motion_and_parallel_sound_finish_before_timeline(monkeypatch):
    finished = set()
    pending = set()
    started = []
    scene_and_sound_ready = None
    async def execute(function, payload, **options):
        nonlocal scene_and_sound_ready
        name = function.__name__
        if name == "choose_production_tool":
            allowed = available_tools(payload["ctx"], payload["history"])
            name = allowed[0]
            parallel = ["design_sound"] if name == "plan_scenes" and "design_sound" in allowed else []
            return {"tool": name, "parallel_tools": parallel, "reason": "Create independent assets"}
        started.append(name)
        if name in {"plan_scenes", "design_sound"}:
            pending.add(name)
            if pending == {"plan_scenes", "design_sound"}:
                scene_and_sound_ready.set()
            # Sequential execution deadlocks: this tests genuine simultaneous starts.
            await asyncio.wait_for(scene_and_sound_ready.wait(), timeout=1)
        if name == "create_motion_graphics":
            assert "plan_scenes" in finished
        if name == "build_timeline":
            assert {"plan_scenes", "design_sound", "create_motion_graphics"} <= finished
            assert payload["custom_motion_created"] is True
        finished.add(name)
        return {"timeline_key": "ready/timeline.json"} if name == "build_timeline" else {"status": "completed"}
    async def run():
        nonlocal scene_and_sound_ready
        scene_and_sound_ready = asyncio.Event()
        return await VideoGenerationWorkflow().run({
            "run_id": "run", "project_id": "project", "production_agent_enabled": True,
            "motion_graphics": {"mode": "custom"},
        })
    monkeypatch.setattr(workflow, "patched", lambda name: True)
    monkeypatch.setattr(workflow, "execute_activity", execute)
    monkeypatch.setattr(workflow, "start_activity", lambda function, payload, **options: asyncio.create_task(execute(function, payload, **options)))
    assert asyncio.run(run()) == "ready/timeline.json"
    assert started.index("create_motion_graphics") < started.index("build_timeline")
    assert "render_video" not in started

def test_failed_caption_tool_recovers_without_repeating_upstream(monkeypatch):
    calls = []
    async def execute(function, payload, **options):
        name = function.__name__
        if name == 'choose_production_tool':
            return {'tool': available_tools(payload['ctx'], payload['history'])[0], 'reason': 'Next prerequisite'}
        calls.append((name, payload.get('caption_spelling_mode')))
        if name == 'build_timeline':
            if payload.get('caption_spelling_mode') != 'local':
                raise ValueError('Caption conversion returned incomplete text')
            return {'timeline_key': 'ready.json'}
        return {}
    monkeypatch.setattr(workflow, 'patched', lambda name: True)
    monkeypatch.setattr(workflow, 'execute_activity', execute)
    monkeypatch.setattr(workflow, 'start_activity', lambda f,p,**kw: asyncio.create_task(execute(f,p,**kw)))
    result = asyncio.run(VideoGenerationWorkflow().run({'run_id':'r','project_id':'p','production_agent_enabled':True,'motion_graphics':{'mode':'none'}}))
    assert result == 'ready.json'
    assert [c for c in calls if c[0]=='build_timeline'] == [('build_timeline',None),('build_timeline','local')]
    assert sum(c[0]=='generate_voice' for c in calls)==1
    assert sum(c[0]=='plan_scenes' for c in calls)==1
    assert not any(c[0]=='fail_run' for c in calls)
