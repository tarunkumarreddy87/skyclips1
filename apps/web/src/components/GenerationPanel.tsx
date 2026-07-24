"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Loader2, AlertCircle, Download, Sparkles } from "lucide-react";
import type { EntryPath } from "@hanuman/shared-types";
import type { ArtifactResponse, GenerationRun, ProgressEvent } from "@/lib/api-client";
import {
  downloadVideo,
  getLatestRun,
  listProgressEvents,
  startGeneration,
  startRender,
  subscribeProgress,
} from "@/lib/api-client";
import { fetchSavedTimelineManifest } from "@/lib/editor/fetch-saved-timeline-manifest";
import { brandComplianceForGenerate, useBrandProfileStore } from "@/lib/brand-profiles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StageDef = {
  key: string;
  label: string;
  detail: string;
};

const PROMPT_FIRST_STAGES: StageDef[] = [
  { key: "validate_brief", label: "Prepare brief", detail: "Lock topic, length, and style" },
  { key: "run_research", label: "Research", detail: "Gather facts and source beats" },
  { key: "generate_script", label: "Write script", detail: "Draft narration and section structure" },
  { key: "generate_voice", label: "Voiceover", detail: "Synthesize narration audio" },
  { key: "plan_scenes", label: "Visuals", detail: "Match B-roll and scene timing" },
  { key: "build_timeline", label: "Timeline", detail: "Assemble the edit for preview" },
];

const SCRIPT_FIRST_STAGES: StageDef[] = [
  { key: "validate_brief", label: "Prepare brief", detail: "Lock topic, length, and style" },
  { key: "parse_script", label: "Process script", detail: "Structure your uploaded narration" },
  { key: "generate_voice", label: "Voiceover", detail: "Synthesize narration audio" },
  { key: "plan_scenes", label: "Visuals", detail: "Match B-roll and scene timing" },
  { key: "build_timeline", label: "Timeline", detail: "Assemble the edit for preview" },
];

/** Render is kicked from the editor (“Render video”), not auto-run after timeline. */
const RENDER_STAGE: StageDef = {
  key: "enqueue_render",
  label: "Render MP4",
  detail: "Export final 1080p from the editor when you’re ready",
};

const STAGE_ALIASES: Record<string, string> = {
  complete_timeline: "build_timeline",
  complete_run: "enqueue_render",
};

/** Mirrors orchestrator `STAGE_PERCENT` — used for fallback UI only. */
const STAGE_PERCENT: Record<string, number> = {
  validate_brief: 5,
  run_research: 15,
  generate_script: 30,
  parse_script: 30,
  generate_voice: 45,
  plan_scenes: 65,
  build_timeline: 78,
  enqueue_render: 90,
};

function mergeProgressEvents(existing: ProgressEvent[], incoming: ProgressEvent[]): ProgressEvent[] {
  const byId = new Map<string, ProgressEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function eventsForRun(events: ProgressEvent[], runId: string | undefined): ProgressEvent[] {
  if (!runId) return events;
  return events.filter((event) => event.runId === runId);
}

interface GenerationPanelProps {
  projectId: string;
  projectStatus: string;
  entryPath?: EntryPath;
  autoStart?: boolean;
}

function stagesForPath(entryPath?: EntryPath): StageDef[] {
  return entryPath === "script_first" ? SCRIPT_FIRST_STAGES : PROMPT_FIRST_STAGES;
}

function resolveStageKey(stage: string, stages: StageDef[]): string {
  const mapped = STAGE_ALIASES[stage] ?? stage;
  if (stages.some((s) => s.key === mapped)) return mapped;
  // Unknown / skipped stage (e.g. parse_script on prompt-first) — fall back carefully
  if (mapped === "parse_script") return "generate_script";
  if (mapped === "generate_script" || mapped === "run_research") {
    const hit = stages.find((s) => s.key === mapped);
    if (hit) return mapped;
  }
  return stages[0]?.key ?? mapped;
}

function stageIndex(stage: string, stages: StageDef[]): number {
  const key = resolveStageKey(stage, stages);
  const idx = stages.findIndex((s) => s.key === key);
  return idx >= 0 ? idx : 0;
}

function humanizeGenerationError(raw: string | null | undefined, stage?: string): string {
  const text = (raw ?? "").trim();
  const lower = text.toLowerCase();

  if (
    !text ||
    lower === "activity task failed" ||
    lower === "activity failure" ||
    lower.startsWith("activity task failed")
  ) {
    switch (stage) {
      case "generate_script":
        return "Writing the script failed. The model may have timed out or returned an incomplete draft — retry to continue.";
      case "parse_script":
        return "Processing your script failed. Check the upload format and try again.";
      case "generate_voice":
        return "Creating the voiceover failed. Check TTS provider credits and retry.";
      case "run_research":
        return "Research failed. Retry to gather sources again.";
      case "plan_scenes":
        return "Planning visuals failed. Retry to rebuild scene matches.";
      case "build_timeline":
        return "Building the timeline failed. Retry to assemble the edit.";
      case "enqueue_render":
        return "Rendering failed. Retry the export when the media worker is ready.";
      default:
        return "Generation failed at this stage. Retry to continue from a fresh run.";
    }
  }

  if (
    lower.includes("concurrency limit") ||
    lower.includes("rate exceeded") ||
    lower.includes("concurrentinvocationlimitexceeded") ||
    (lower.includes("render-service") && lower.includes("rate"))
  ) {
    return "Render hit the AWS Lambda concurrency limit (this account allows ~10 parallel Lambdas). Retry export — chunking is tuned for that cap. For faster long renders, request a Lambda concurrency increase in AWS Service Quotas.";
  }
  if (lower.includes("heartbeat")) {
    return "Rendering stalled (heartbeat timeout). Retry render — encoding keeps the job alive now. Your timeline is kept.";
  }
  if (lower.includes("402") || lower.includes("insufficient") || lower.includes("quota") || lower.includes("credit")) {
    return "Voice synthesis is out of credits. Top up Sarvam (or update SARVAM_API_KEY), then retry.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "The voice service is rate-limiting requests. Wait a moment and retry.";
  }
  if (lower.includes("openrouter") || lower.includes("llm") || lower.includes("model")) {
    return `Script generation hit a model error: ${text}`;
  }

  return text;
}

/** Failures at export should re-run VideoRenderWorkflow only, not the full AI pipeline. */
function isRenderStageFailure(stage: string | null | undefined): boolean {
  const key = STAGE_ALIASES[stage ?? ""] ?? stage ?? "";
  return key === "enqueue_render" || stage === "complete_run";
}

export function GenerationPanel({
  projectId,
  projectStatus,
  entryPath = "prompt_first",
  autoStart = false,
}: GenerationPanelProps) {
  const router = useRouter();
  const stages = useMemo(() => stagesForPath(entryPath), [entryPath]);
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [video, setVideo] = useState<ArtifactResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const runIdRef = useRef<string | null>(null);
  const percentHighWaterRef = useRef(0);
  const trackedRunIdRef = useRef<string | null>(null);

  runIdRef.current = run?.id ?? null;
  if (run?.id !== trackedRunIdRef.current) {
    trackedRunIdRef.current = run?.id ?? null;
    percentHighWaterRef.current = 0;
  }

  const runEvents = useMemo(() => eventsForRun(events, run?.id), [events, run?.id]);

  const failedEvent = useMemo(
    () => [...runEvents].reverse().find((e) => e.status === "failed"),
    [runEvents],
  );
  const latestEvent = runEvents[runEvents.length - 1];
  const isRunning = run?.status === "running" || run?.status === "queued";
  const runCompleted = run?.status === "completed";
  const isFailed = run?.status === "failed" || projectStatus === "failed";
  const videoReady =
    Boolean(video) || (runCompleted && run?.currentStage === "enqueue_render");
  // Timeline pipeline finished (MP4 still optional via editor “Render video”).
  const timelineReady = runCompleted && !isFailed && !videoReady;
  const isFullyDone = videoReady;

  const currentStageRaw =
    (isFailed ? failedEvent?.stage ?? run?.currentStage : latestEvent?.stage ?? run?.currentStage) ??
    "";
  const currentStage = resolveStageKey(currentStageRaw, stages);
  const reachedIdx = isFailed
    ? stageIndex(currentStage, stages)
    : timelineReady || videoReady
      ? stages.length - 1
      : stageIndex(currentStage, stages);

  const maxEventPercent = useMemo(() => {
    let max = 0;
    for (const event of runEvents) {
      if (event.percent != null) max = Math.max(max, event.percent);
    }
    return max;
  }, [runEvents]);

  const stagePercent =
    STAGE_PERCENT[resolveStageKey(currentStageRaw, stages)] ??
    STAGE_PERCENT[currentStage] ??
    0;

  const percentFromEvents = maxEventPercent > 0 ? maxEventPercent : undefined;
  const rawPercent =
    percentFromEvents ??
    (videoReady
      ? 100
      : timelineReady
        ? 100
        : isFailed
          ? stagePercent || Math.round(((reachedIdx + 0.5) / stages.length) * 100)
          : isRunning
            ? stagePercent || Math.round(((reachedIdx + 0.35) / stages.length) * 100)
            : 0);

  const percent = (() => {
    const clamped = Math.min(100, Math.max(0, rawPercent));
    const monotonic = Math.max(percentHighWaterRef.current, clamped);
    if (monotonic > percentHighWaterRef.current) {
      percentHighWaterRef.current = monotonic;
    }
    return monotonic;
  })();

  const statusLabel = isFailed
    ? "Failed"
    : videoReady
      ? "Video ready"
      : timelineReady
        ? "Timeline ready"
        : isRunning
          ? "In production"
            : run
              ? "Queued"
              : "Ready";

  const refreshVideo = useCallback(async () => {
    try {
      const artifact = await downloadVideo(projectId);
      setVideo(artifact);
    } catch {
      setVideo(null);
    }
  }, [projectId]);

  const loadEvents = useCallback(async (runId?: string) => {
    try {
      const history = await listProgressEvents(projectId, runId);
      setEvents((prev) => mergeProgressEvents(prev, history));
      const scoped = eventsForRun(history, runId);
      const failed = [...scoped].reverse().find((e) => e.status === "failed");
      if (failed?.message) setError(failed.message);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const brand = useBrandProfileStore.getState().getActiveProfile();
      const result = await startGeneration(projectId, {
        brandCompliance: brandComplianceForGenerate(brand),
      });
      setRun(result.run);
      setEvents([]);
      setVideo(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start generation";
      if (message.toLowerCase().includes("already in progress")) {
        try {
          const latest = await getLatestRun(projectId);
          if (latest) {
            setRun(latest);
            setError(null);
            await loadEvents(latest.id);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId, loadEvents]);

  const handleRetry = useCallback(async () => {
    const failedStage = failedEvent?.stage ?? run?.currentStage ?? currentStageRaw;
    const renderOnly = isRenderStageFailure(failedStage);

    setLoading(true);
    setError(null);
    try {
      const brand = useBrandProfileStore.getState().getActiveProfile();
      const compliance = { brandCompliance: brandComplianceForGenerate(brand) };
      let result;
      if (renderOnly) {
        try {
          const manifest = await fetchSavedTimelineManifest(projectId);
          result = await startRender(projectId, manifest);
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          // No timeline on disk → must regenerate from the AI pipeline.
          if (
            message.toLowerCase().includes("timeline") ||
            message.toLowerCase().includes("404") ||
            message.toLowerCase().includes("not found")
          ) {
            result = await startGeneration(projectId, compliance);
          } else {
            throw e;
          }
        }
      } else {
        result = await startGeneration(projectId, compliance);
      }
      setRun(result.run);
      setEvents([]);
      setVideo(null);
      if (renderOnly) {
        router.replace(`/projects/${projectId}/video`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to retry";
      if (message.toLowerCase().includes("already in progress")) {
        try {
          const latest = await getLatestRun(projectId);
          if (latest) {
            setRun(latest);
            setError(null);
            await loadEvents(latest.id);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    failedEvent?.stage,
    run?.currentStage,
    currentStageRaw,
    projectId,
    loadEvents,
    router,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(projectId);
        if (cancelled) return;
        setRun(latest);
        if (latest) await loadEvents(latest.id);
        if (latest?.status === "completed") await refreshVideo();
      } catch {
        /* no run yet */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshVideo, loadEvents]);

  // Only auto-start once after hydration, for brand-new approved projects with no prior run.
  // Never restart on refresh when a failed/running/completed run already exists.
  useEffect(() => {
    if (!hydrated || !autoStart || loading || run) return;
    if (projectStatus !== "approved") return;
    void handleStart();
  }, [hydrated, autoStart, projectStatus, run, loading, handleStart]);

  useEffect(() => {
    if (!run || run.status === "completed" || run.status === "failed") return;

    const refreshRun = () => {
      void getLatestRun(projectId).then((latest) => {
        if (!latest) return;
        setRun(latest);
        // Always reload events too — SSE can drop or be buffered by proxies, so the
        // 2.5s poll is the reliable fallback for live stage updates.
        void loadEvents(latest.id);
        if (latest.status === "completed" || latest.status === "failed") {
          void loadEvents(latest.id);
        }
      });
    };

    const unsubscribe = subscribeProgress(projectId, (event) => {
      const activeRunId = runIdRef.current;
      if (activeRunId && event.runId !== activeRunId) return;
      setEvents((prev) =>
        prev.some((e) => e.id === event.id) ? prev : mergeProgressEvents(prev, [event]),
      );
      if (event.status === "failed") {
        setError(event.message);
        refreshRun();
      }
      // Any completed stage can flip run → completed (especially build_timeline).
      if (event.status === "completed") {
        refreshRun();
      }
    });

    const poll = setInterval(refreshRun, 2500);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [projectId, run, loadEvents]);

  // Only auto-navigate when the final MP4 is ready. Timeline-ready stays on queue
  // so the user can see stages + open the editor deliberately.
  useEffect(() => {
    if (run?.status !== "completed") return;
    void refreshVideo();
    if (run.currentStage === "enqueue_render") {
      router.replace(`/projects/${projectId}/video`);
    }
  }, [run?.status, run?.currentStage, refreshVideo, router, projectId]);

  useEffect(() => {
    if (run?.status === "failed" && run.errorMessage) {
      setError((prev) => prev || run.errorMessage || null);
    }
  }, [run?.status, run?.errorMessage]);

  const displayError = humanizeGenerationError(
    // Prefer stage progress text (often specific) over Temporal's generic run.errorMessage.
    failedEvent?.message || error || (isFailed ? run?.errorMessage : null),
    failedEvent?.stage || currentStageRaw || currentStage,
  );
  const liveMessage =
    !isFailed && latestEvent?.message && latestEvent.status !== "failed" ? latestEvent.message : null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#222] shadow-[0_24px_80px_-40px_rgba(0,0,0,0.65)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_0%,rgba(56,189,248,0.1),transparent_45%),radial-gradient(ellipse_at_90%_8%,rgba(251,191,36,0.08),transparent_40%)]"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Production pipeline
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">
              Video generation
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {entryPath === "script_first" ? "Script-first path" : "Prompt-first path"} ·{" "}
              {stages.length} stages
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1",
                isFailed && "bg-red-500/10 text-red-300 ring-red-500/25",
                isFullyDone &&
                  !isFailed &&
                  "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
                timelineReady &&
                  !isFailed &&
                  "bg-amber-500/10 text-amber-200 ring-amber-500/25",
                isRunning && "bg-sky-500/10 text-sky-300 ring-sky-500/25",
                !isFailed &&
                  !timelineReady &&
                  !isFullyDone &&
                  !isRunning &&
                  "bg-white/5 text-zinc-400 ring-white/10",
              )}
            >
              {isRunning ? <Loader2 className="size-3 animate-spin" /> : null}
              {isFullyDone && !isFailed ? <Sparkles className="size-3" /> : null}
              {timelineReady && !isFailed ? <Check className="size-3" /> : null}
              {isFailed ? <AlertCircle className="size-3" /> : null}
              {statusLabel}
            </span>
            <div className="text-right">
              <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-white">
                {percent}
                <span className="text-lg text-zinc-500">%</span>
              </p>
            </div>
          </div>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              isFailed
                ? "bg-red-500"
                : "bg-gradient-to-r from-sky-400 via-cyan-400 to-amber-300",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>

        {!run && (projectStatus === "approved" || projectStatus === "failed") && (
          <Button
            type="button"
            onClick={() => void (projectStatus === "failed" ? handleRetry() : handleStart())}
            disabled={loading}
            className="w-full bg-white text-[#111] hover:bg-zinc-200 sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : projectStatus === "failed" ? (
              "Retry"
            ) : (
              "Generate video"
            )}
          </Button>
        )}

        {(run || isRunning || timelineReady || isFullyDone || isFailed) && (
          <ol className="flex flex-col gap-0">
            {stages.map((stage, i) => {
              const done =
                !isFailed &&
                (timelineReady || videoReady
                  ? true
                  : i < reachedIdx ||
                    (i === reachedIdx &&
                      latestEvent?.status === "completed" &&
                      resolveStageKey(latestEvent.stage, stages) === stage.key));
              const active = i === reachedIdx && isRunning;
              const failed = isFailed && i === reachedIdx;

              return (
                <li key={stage.key} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < stages.length - 1 ? (
                    <span
                      className={cn(
                        "absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px",
                        done && !failed ? "bg-emerald-500/50" : "bg-white/10",
                      )}
                      aria-hidden
                    />
                  ) : null}

                  <span
                    className={cn(
                      "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                      failed && "bg-red-500/15 text-red-300 ring-red-500/40",
                      done &&
                        !failed &&
                        "bg-emerald-500/15 text-emerald-300 ring-emerald-500/35",
                      active && "bg-sky-500/15 text-sky-300 ring-sky-500/40",
                      !done &&
                        !active &&
                        !failed &&
                        "bg-white/[0.04] text-zinc-500 ring-white/10",
                    )}
                  >
                    {failed ? (
                      <AlertCircle className="size-4" />
                    ) : done ? (
                      <Check className="size-4" strokeWidth={2.5} />
                    ) : active ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Circle className="size-3.5 opacity-50" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className={cn(
                          "font-medium tracking-tight",
                          failed && "text-red-300",
                          (done || active) && !failed && "text-white",
                          !done && !active && !failed && "text-zinc-500",
                        )}
                      >
                        {stage.label}
                      </p>
                      <span className="shrink-0 text-[11px] uppercase tracking-wider text-zinc-500">
                        {failed ? "Failed" : done ? "Done" : active ? "Running" : "Waiting"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-500">{stage.detail}</p>
                  </div>
                </li>
              );
            })}

            <li className="relative flex gap-4 pt-1">
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
                  videoReady
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/35"
                    : "bg-white/[0.04] text-zinc-500 ring-white/10",
                )}
              >
                {videoReady ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  <Circle className="size-3.5 opacity-50" />
                )}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={cn(
                      "font-medium tracking-tight",
                      videoReady ? "text-white" : "text-zinc-500",
                    )}
                  >
                    {RENDER_STAGE.label}
                  </p>
                  <span className="shrink-0 text-[11px] uppercase tracking-wider text-zinc-500">
                    {videoReady ? "Done" : "In editor"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-zinc-500">{RENDER_STAGE.detail}</p>
              </div>
            </li>
          </ol>
        )}

        {timelineReady && !videoReady ? (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-4">
            <p className="text-sm font-medium text-emerald-200">
              Timeline is ready — open the editor to preview, then click Render video for the MP4.
            </p>
            <Button
              type="button"
              className="w-fit bg-white text-[#111] hover:bg-zinc-200"
              onClick={() => router.push(`/projects/${projectId}/editor`)}
            >
              Open editor
            </Button>
          </div>
        ) : null}

        {liveMessage ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
            {liveMessage}
          </p>
        ) : null}

        {isFullyDone && video ? (
          <Button
            variant="outline"
            className="border-white/10 bg-transparent text-white hover:bg-white/5"
            render={<a href={video.downloadUrl} download />}
          >
            <Download className="size-4" />
            Download video (MP4)
          </Button>
        ) : null}

        {isFailed ? (
          <div className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-4">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
              <div className="min-w-0 flex flex-col gap-1">
                <p className="text-sm font-medium text-red-300">
                  {stages.find((s) => s.key === currentStage)?.label ?? "Generation"} failed
                </p>
                <p className="text-sm text-zinc-400">{displayError}</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void handleRetry()}
              disabled={loading}
              size="sm"
              className="w-fit bg-white text-[#111] hover:bg-zinc-200"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isRenderStageFailure(failedEvent?.stage ?? run?.currentStage)
                    ? "Retrying render…"
                    : "Restarting…"}
                </>
              ) : isRenderStageFailure(failedEvent?.stage ?? run?.currentStage) ? (
                "Retry render"
              ) : (
                "Retry generation"
              )}
            </Button>
          </div>
        ) : null}

        {error && !isFailed ? (
          <p className="text-sm text-red-400">{humanizeGenerationError(error)}</p>
        ) : null}
      </div>
    </section>
  );
}
