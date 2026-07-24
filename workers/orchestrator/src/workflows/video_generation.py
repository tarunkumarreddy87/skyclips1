from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
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
_SCHEDULE_TO_START = timedelta(minutes=5)


@workflow.defn(name="VideoGenerationWorkflow")
class VideoGenerationWorkflow:
    @workflow.run
    async def run(self, ctx: dict) -> str:
        retry = RetryPolicy(maximum_attempts=3)
        duration_sec = int(ctx.get("target_duration_sec") or 300)
        current_stage = "validate_brief"
        try:
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
            raise


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
                task_queue="media",
                start_to_close_timeout=timedelta(minutes=180),
                # Remotion local can stall during frame mux / Chrome GC; allow longer gaps
                # than the shared generation-pipeline heartbeat budget.
                heartbeat_timeout=timedelta(minutes=10),
                schedule_to_start_timeout=_SCHEDULE_TO_START,
                retry_policy=RetryPolicy(maximum_attempts=2),
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
            raise


@workflow.defn(name="HealthCheckWorkflow")
class HealthCheckWorkflow:
    @workflow.run
    async def run(self) -> str:
        return "ok"
