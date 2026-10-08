from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.activities.production_agent import choose_production_tool, plan_production
    from src.activities.production_motion import create_motion_graphics
    from src.activities.production_sound import design_sound
    from src.activities.production_visuals import direct_visuals
    from src.activities.pipeline import (
        STAGE_PERCENT,
        build_timeline,
        complete_timeline,
        complete_run,
        fail_run,
        generate_script,
        generate_voice,
        parse_script,
        plan_scenes,
        review_timeline,
        run_research,
        validate_brief,
    )


def _timeout_for_duration(base_minutes: int, duration_sec: int, *, per_minute: float = 0.15) -> timedelta:
    """Scale activity timeouts with target video length (long scripts need more LLM/TTS time)."""
    extra = max(0, int(duration_sec) // 60) * per_minute
    return timedelta(minutes=max(base_minutes, int(base_minutes + extra)))


def _unwrap_activity_error(exc: BaseException) -> str:
    """Prefer the application/cause message over Temporal's generic 'Activity task failed'."""
    generic = {"activity task failed", "activity failure", "activity timed out"}
    messages: list[str] = []
    cur: BaseException | None = exc
    for _ in range(8):
        if cur is None:
            break
        text = (getattr(cur, "message", None) or str(cur) or "").strip()
        if text and text.lower() not in generic:
            messages.append(text)
        cur = cur.__cause__ or getattr(cur, "cause", None)  # type: ignore[assignment]
    return messages[-1] if messages else (str(exc).strip() or "Generation failed")


# Dead workers must release long activities quickly (not wait for start_to_close).
# Must exceed worst-case single OpenRouter/TTS HTTP call (~180s) + margin.
_HEARTBEAT = timedelta(minutes=4)
# Bounded worker slots intentionally queue simultaneous long generations. A five
# minute queue timeout killed otherwise healthy runs before they could start.
_SCHEDULE_TO_START = timedelta(hours=1)


@workflow.defn(name="VideoGenerationWorkflow")
class VideoGenerationWorkflow:
    @workflow.run
    async def run(self, ctx: dict) -> str:
        retry = RetryPolicy(maximum_attempts=3)
        duration_sec = int(ctx.get("target_duration_sec") or 300)
        current_stage = "validate_brief"
        try:
            if workflow.patched("production-agent-v1") and ctx.get("production_agent_enabled"):
                current_stage = "production_agent"
                return await self._run_agent(ctx, retry, duration_sec)
            await workflow.execute_activity(
                validate_brief,
                ctx,
                start_to_close_timeout=timedelta(seconds=30),
                schedule_to_start_timeout=_SCHEDULE_TO_START,
                retry_policy=retry,
            )

            if ctx.get("entry_path") != "script_first":
                current_stage = "run_research"
                await workflow.execute_activity(
                    run_research,
                    ctx,
                    start_to_close_timeout=timedelta(minutes=10),
                    heartbeat_timeout=_HEARTBEAT,
                    schedule_to_start_timeout=_SCHEDULE_TO_START,
                    retry_policy=retry,
                )

            if ctx.get("entry_path") == "script_first":
                current_stage = "parse_script"
                await workflow.execute_activity(
                    parse_script,
                    ctx,
                    start_to_close_timeout=_timeout_for_duration(15, duration_sec, per_minute=0.2),
                    heartbeat_timeout=_HEARTBEAT,
                    schedule_to_start_timeout=_SCHEDULE_TO_START,
                    retry_policy=retry,
                )
            else:
                current_stage = "generate_script"
                await workflow.execute_activity(
                    generate_script,
                    ctx,
                    # Multi-pass script + extension can be dozens of LLM calls for long videos.
                    start_to_close_timeout=_timeout_for_duration(45, duration_sec, per_minute=2.0),
                    heartbeat_timeout=_HEARTBEAT,
                    schedule_to_start_timeout=_SCHEDULE_TO_START,
                    retry_policy=retry,
                )

            current_stage = "generate_voice"
            await workflow.execute_activity(
                generate_voice,
                ctx,
                start_to_close_timeout=_timeout_for_duration(30, duration_sec, per_minute=1.0),
                heartbeat_timeout=_HEARTBEAT,
                schedule_to_start_timeout=_SCHEDULE_TO_START,
                retry_policy=retry,
            )
            current_stage = "plan_scenes"
            await workflow.execute_activity(
                plan_scenes,
                ctx,
                start_to_close_timeout=_timeout_for_duration(20, duration_sec, per_minute=0.4),
                heartbeat_timeout=_HEARTBEAT,
                schedule_to_start_timeout=_SCHEDULE_TO_START,
                retry_policy=retry,
            )
            current_stage = "build_timeline"
            timeline = await workflow.execute_activity(
                build_timeline,
                ctx,
                start_to_close_timeout=timedelta(minutes=10),
                heartbeat_timeout=_HEARTBEAT,
                schedule_to_start_timeout=_SCHEDULE_TO_START,
                retry_policy=retry,
            )
            current_stage = "complete_timeline"
            await workflow.execute_activity(
                complete_timeline,
                ctx,
                start_to_close_timeout=timedelta(seconds=30),
                schedule_to_start_timeout=_SCHEDULE_TO_START,
            )
            return timeline["timeline_key"]

        except Exception as exc:
            try:
                await workflow.execute_activity(
                    fail_run,
                    {
                        "run_id": ctx["run_id"],
                        "project_id": ctx["project_id"],
                        "stage": current_stage,
                        "error": _unwrap_activity_error(exc),
                        "percent": STAGE_PERCENT.get(current_stage, 50),
                    },
                    start_to_close_timeout=timedelta(seconds=30),
                )
            except Exception as fail_exc:
                # Surface the original stage failure, not the bookkeeping failure.
                workflow.logger.error(
                    "fail_run could not record failure of %s for run %s: %s",
                    current_stage,
                    ctx.get("run_id"),
                    _unwrap_activity_error(fail_exc),
                )
            raise

    async def _run_agent(self, ctx: dict, retry: RetryPolicy, duration_sec: int) -> str:
        history = []
        timeline = None
        tools = {"validate_brief": validate_brief, "run_research": run_research,
                 "plan_production": plan_production,
                 "design_sound": design_sound,
                 "direct_visuals": direct_visuals,
                 "generate_script": generate_script, "parse_script": parse_script,
                 "generate_voice": generate_voice, "plan_scenes": plan_scenes,
                 "build_timeline": build_timeline, "review_timeline": review_timeline,
                 "create_motion_graphics": create_motion_graphics, "complete_timeline": complete_timeline}
        minutes = {"validate_brief": 1, "plan_production": 8, "run_research": 10, "generate_script": 45,
                   "parse_script": 15, "generate_voice": 30, "plan_scenes": 20,
                   "build_timeline": 10, "review_timeline": 10, "create_motion_graphics": 10, "design_sound": 10, "direct_visuals": 10, "complete_timeline": 1}
        for _ in range(15):
            decision = await workflow.execute_activity(
                choose_production_tool, {"ctx": ctx, "history": history},
                start_to_close_timeout=timedelta(minutes=8),
                schedule_to_start_timeout=_SCHEDULE_TO_START, retry_policy=retry)
            name = decision["tool"]
            if name == "finish":
                if timeline is None:
                    raise ValueError("Agent finished without a timeline")
                return timeline["timeline_key"]
            if name not in tools:
                raise ValueError("Unknown production tool")
            tool_ctx = {**ctx, "director_feedback": decision["reason"], "script_revision": sum(e["tool"] == "generate_script" for e in history) if name == "generate_script" else 0,
                        "custom_motion_created": any(e["tool"] == "create_motion_graphics" for e in history), "production_agent_enabled": True}
            requested = [name, *decision.get("parallel_tools", [])]
            if len(requested) > 1 and (len(requested) != 2 or set(requested) not in (
                {"plan_scenes", "design_sound"}, {"direct_visuals", "create_motion_graphics"}
            )):
                raise ValueError("Only independent production tools may run together")
            handles = [workflow.start_activity(
                tools[tool], tool_ctx,
                start_to_close_timeout=_timeout_for_duration(minutes[tool], duration_sec, per_minute=2 if tool == "generate_script" else 1),
                heartbeat_timeout=_HEARTBEAT if tool not in {"validate_brief", "complete_timeline"} else None,
                schedule_to_start_timeout=_SCHEDULE_TO_START, retry_policy=retry) for tool in requested]
            results = []
            for tool, handle in zip(requested, handles, strict=True):
                try:
                    tool_result = await handle
                except Exception as exc:
                    error = _unwrap_activity_error(exc)
                    # Replay-safe, scoped recovery: change the failed operation,
                    # not the user's language or any completed upstream work.
                    recover_caption = (workflow.patched("production-caption-recovery-v1")
                        and tool == "build_timeline"
                        and any(term in error.lower() for term in ("caption", "language conversion", "jsondecodeerror")))
                    if not recover_caption:
                        raise
                    tool_result = await workflow.execute_activity(
                        tools[tool], {**tool_ctx, "caption_spelling_mode": "local"},
                        start_to_close_timeout=_timeout_for_duration(minutes[tool], duration_sec),
                        heartbeat_timeout=_HEARTBEAT,
                        schedule_to_start_timeout=_SCHEDULE_TO_START,
                        retry_policy=RetryPolicy(maximum_attempts=1))
                    tool_result = {**tool_result, "recovery": "local_caption_transliteration"}
                results.append(tool_result)
            for tool, tool_result in zip(requested, results, strict=True):
                history.append({"tool": tool, "status": "completed", "result": tool_result})
            result = results[0]
            if name == "plan_production":
                ctx = {**ctx, "production_plan": result}
            if name == "build_timeline":
                timeline = result
        raise ValueError("Production agent tool budget exhausted")


@workflow.defn(name="VideoRenderWorkflow")
class VideoRenderWorkflow:
    @workflow.run
    async def run(self, ctx: dict) -> str:
        current_stage = "enqueue_render"
        try:
            # Render MP4 from latest timeline manifest.
            final_key = await workflow.execute_activity(
                "render_video",
                {"project_id": ctx["project_id"], "run_id": ctx["run_id"], "timeline_key": ctx["timeline_key"]},
                # The API passes its configured media queue in the input; reading worker
                # settings here would make replay depend on which worker runs it.
                task_queue=ctx.get("media_task_queue") or "media",
                start_to_close_timeout=timedelta(minutes=180),
                # Native encoding can stall during mux or section finalization; allow longer gaps
                # than the shared generation-pipeline heartbeat budget.
                heartbeat_timeout=timedelta(minutes=10),
                schedule_to_start_timeout=_SCHEDULE_TO_START,
                retry_policy=RetryPolicy(maximum_attempts=2, non_retryable_error_types=["RenderFatalError"]),
            )

            current_stage = "complete_run"
            await workflow.execute_activity(
                complete_run,
                {**ctx, "final_key": final_key},
                start_to_close_timeout=timedelta(seconds=30),
                schedule_to_start_timeout=_SCHEDULE_TO_START,
            )
            return final_key
        except Exception as exc:
            try:
                await workflow.execute_activity(
                    fail_run,
                    {
                        "run_id": ctx["run_id"],
                        "project_id": ctx["project_id"],
                        "stage": current_stage,
                        "error": _unwrap_activity_error(exc),
                        "percent": STAGE_PERCENT.get(current_stage, 90),
                    },
                    start_to_close_timeout=timedelta(seconds=30),
                )
            except Exception as fail_exc:
                # Surface the original render failure, not the bookkeeping failure.
                workflow.logger.error(
                    "fail_run could not record failure of %s for run %s: %s",
                    current_stage,
                    ctx.get("run_id"),
                    _unwrap_activity_error(fail_exc),
                )
            raise


@workflow.defn(name="HealthCheckWorkflow")
class HealthCheckWorkflow:
    @workflow.run
    async def run(self) -> str:
        return "ok"
