"""Explicit real-provider smoke test, never run automatically.

Copy to API container and run ``python /tmp/production-agent-smoke.py prepare``.
Copy resulting /tmp/production-agent-smoke-context.json to orchestration container.
Run ``python /tmp/production-agent-smoke.py run`` there AFTER deploying new code.
Creates isolated QA records with zero user credits charged. Provider usage is real.
No final render workflow is started; the output is an editable timeline.
"""
import argparse
import asyncio
import json
import uuid
from pathlib import Path


async def prepare(path):
    from sqlalchemy import select
    from app.db.session import async_session_factory
    from app.db.models import User, Project, Brief, Quote, GenerationRun
    from app.db.models.enums import EntryPath, FormatMode, ProjectStatus, QuoteStatus
    async with async_session_factory() as session:
        user = (await session.execute(select(User).order_by(User.created_at).limit(1))).scalar_one_or_none()
        if user is None:
            raise RuntimeError("A local test owner must exist before preparing smoke records")
        project = Project(id=uuid.uuid4(), user_id=user.id, title="QA main agent: how solar panels work", status=ProjectStatus.QUEUED,
                          entry_path=EntryPath.PROMPT_FIRST, format_mode=FormatMode.DOCUMENTARY)
        brief = Brief(project=project, prompt_text="Explain how solar panels turn sunlight into electricity in a clear 60-second documentary. Open with an engaging question, explain the mechanism accurately, and finish with a practical takeaway. Use one original animated explanatory diagram, not invented statistics.",
                      target_duration_sec=60, language="en", brand_profile_id="qa-production-agent", model_id="hanuman-v1")
        quote = Quote(id=uuid.uuid4(), project=project, format_mode=FormatMode.DOCUMENTARY, duration_sec=60, language="en", voice_id="shubh",
                      credit_estimate=0, status=QuoteStatus.APPROVED, brand_profile_id="qa-production-agent", section_outline=[])
        run = GenerationRun(id=uuid.uuid4(), project=project, quote=quote, credit_charged_amount=0)
        session.add_all([project, brief, quote, run])
        await session.commit()
        ctx = dict(project_id=str(project.id), run_id=str(run.id), quote_id=str(quote.id), entry_path="prompt_first", format_mode="documentary",
                   title=project.title, prompt_text=brief.prompt_text, target_duration_sec=60, language="en", language_locked=True,
                   voice_id="shubh", caption_script="latin", commercial_stock=True, general_web_crawling=False, ai_generated_images=False,
                   uploaded_templates=[], brand_profile_id="standard", channel_profile_id="qa-production-agent", production_agent_enabled=True,
                   motion_graphics={"mode":"custom", "enabled":True, "soundEnabled":True}, media_task_queue="media")
        path.write_text(json.dumps(ctx, indent=2), encoding="utf-8")
        print(json.dumps({"prepared":True, "context_file":str(path), "user_credit_charge":0, "provider_usage_real":True}))


async def run(path):
    from temporalio.client import Client
    from src.config import settings
    from src.pipeline.storage import get_json, artifact_key, put_json
    ctx = json.loads(path.read_text(encoding="utf-8"))
    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)
    handle = await client.start_workflow("VideoGenerationWorkflow", ctx,
                                       id="qa-production-agent-" + ctx["run_id"], task_queue=settings.temporal_task_queue_orchestrator)
    print(json.dumps({"started":True, "project_id":ctx["project_id"], "run_id":ctx["run_id"]}), flush=True)
    key = await handle.result()
    timeline = await asyncio.to_thread(get_json, key)
    state = await asyncio.to_thread(get_json, artifact_key(ctx["project_id"],ctx["run_id"],"production-state.json"))
    stages = [x["tool"] for x in state.get("completed_tools", [])]
    required = {"validate_brief", "plan_production", "run_research", "generate_script", "generate_voice", "plan_scenes", "direct_visuals", "create_motion_graphics", "design_sound", "build_timeline", "review_timeline", "complete_timeline"}
    assert required.issubset(stages), "Main-agent stages missing: " + str(required-set(stages))
    assert "render_video" not in stages, "Generation must not trigger final rendering"
    from src.pipeline.director import inspect_timeline
    assert not inspect_timeline(timeline), "Final timeline failed structural inspection"
    tracks = timeline.get("tracks") or {}
    assert tracks.get("video") and tracks.get("audio") and tracks.get("captions"), "Missing visuals, narration or captions"
    assert tracks.get("music"), "No background music was arranged"
    clips = tracks.get("video", []) + tracks.get("broll", [])
    original_count = sum(bool(c.get("three_scene") or ((c.get("motion_template") or {}).get("html_template") or {}).get("js")) for c in clips)
    assert original_count, "No original motion graphics reached the timeline"
    from src.activities.pipeline import _order_story_sections
    script = await asyncio.to_thread(get_json, artifact_key(ctx["project_id"],ctx["run_id"],"script.json"))
    sections = script.get("sections", [])
    assert sections == _order_story_sections(sections), "Story ending appears before appended body sections"
    closing = [i for i,s in enumerate(sections) if s.get("story_role") == "closing"]
    assert closing and closing[-1] == len(sections)-1, "Actual closing section must be observed at the end"
    proof = {"passed":True,"project_id":ctx["project_id"],"run_id":ctx["run_id"],"timeline_key":key,
             "completed_tools":stages,"final_render_started":False,"provider_usage_real":True,
             "visual_preview_review_claimed":False,"user_credit_charge":0,"original_motion_clips":original_count,
             "duration_sec":timeline.get("metadata",{}).get("duration_sec"),"narration_tracks":len(tracks["audio"])}
    await asyncio.to_thread(put_json, artifact_key(ctx["project_id"],ctx["run_id"],"qa-smoke-proof.json"),proof)
    print(json.dumps(proof), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "run"])
    parser.add_argument("--context", type=Path, default=Path("/tmp/production-agent-smoke-context.json"))
    args = parser.parse_args()
    asyncio.run(prepare(args.context) if args.action == "prepare" else run(args.context))
