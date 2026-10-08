"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Download, Loader2, Share2, TriangleAlert } from "lucide-react";
import {
  downloadVideo,
  getLatestRun,
  startRender,
  subscribeProgress,
} from "@/lib/api-client";
import { fetchSavedTimelineManifest } from "@/lib/editor/fetch-saved-timeline-manifest";
import { Button } from "@/components/ui/button";
import { initialVideoResultState, isRendering, videoResultReducer } from "./video-result-state";

export function VideoResultView({ projectId }: { projectId: string }) {
  const [{ video, run, error, percent }, dispatch] = useReducer(videoResultReducer, initialVideoResultState);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const mp4Url = useMemo(() => video?.downloadUrl ?? "", [video?.downloadUrl]);
  const rendering = isRendering(run);
  const activeRunId = rendering ? run?.id ?? null : null;

  const loadVideo = useCallback(async (runId: string | null, signal?: AbortSignal) => {
    try {
      const artifact = await downloadVideo(projectId, signal, runId ?? undefined);
      if ((artifact.runId ?? null) !== runId) throw new Error("Video for this render is not ready");
      if (!signal?.aborted) dispatch({ type: "video", runId, video: artifact });
    } catch (e) {
      if (!signal?.aborted) dispatch({ type: "error", runId, message: e instanceof Error ? e.message : "Video not ready" });
    }
  }, [projectId]);

  const handleRetryRender = useCallback(async () => {
    setRetrying(true);
    try {
      const manifest = await fetchSavedTimelineManifest(projectId);
      const started = await startRender(projectId, manifest);
      dispatch({ type: "run", run: started.run, percent: 0 });
    } catch (e) {
      dispatch({ type: "error", runId: run?.id ?? null, retry: true, message: e instanceof Error ? e.message : "Could not retry render" });
    } finally {
      setRetrying(false);
    }
  }, [projectId, run?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(projectId);
        if (cancelled) return;
        dispatch({ type: "run", run: latest });
      } catch (e) {
        if (!cancelled) dispatch({ type: "error", runId: null, message: e instanceof Error ? e.message : "Failed to load" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (loading || (run && run.status !== "completed")) return;
    const controller = new AbortController();
    void loadVideo(run?.id ?? null, controller.signal);
    return () => controller.abort();
  }, [loading, run?.id, run?.status, loadVideo]);

  useEffect(() => {
    if (!activeRunId) return;

    let cancelled = false;
    let refreshInFlight = false;
    const refreshRun = async () => {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const latest = await getLatestRun(projectId);
        if (cancelled || !latest) return;
        dispatch({ type: "run", run: latest });
      } catch {
        /* retry on the next event/poll */
      } finally {
        refreshInFlight = false;
      }
    };

    const unsubscribe = subscribeProgress(projectId, (event) => {
      if (event.runId !== activeRunId) return;
      dispatch({ type: "progress", event });
      if (event.stage === "enqueue_render" && event.status === "completed") {
        void refreshRun();
      }
      if (event.status === "failed") {
        void refreshRun();
      }
    });

    const poll = setInterval(() => void refreshRun(), 2500);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(poll);
    };
  }, [projectId, activeRunId]);

  if (loading || (run?.status === "completed" && !video && !error)) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading video…
      </div>
    );
  }

  if (rendering) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Rendering your video</h1>
        <p className="text-sm text-muted-foreground">
          Export in progress{typeof percent === "number" ? ` · ${percent}%` : ""}. This page will show
          the download when the MP4 is ready.
        </p>
        <div className="mx-auto h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.min(100, Math.max(8, percent ?? 8))}%` }}
          />
        </div>
        <Button variant="outline" render={<Link href={`/projects/${projectId}/editor`} />}>
          Back to editor
        </Button>
      </div>
    );
  }

  if (!video || error) {
    const renderFailed = run?.status === "failed";
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card p-8 text-center shadow-sm">
        <TriangleAlert className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error ?? "Video not found. Render from the editor first."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" render={<Link href={`/projects/${projectId}/editor`} />}>
            Back to editor
          </Button>
          <Button variant="outline" render={<Link href={`/projects/${projectId}/queue`} />}>
            Back to queue
          </Button>
          {renderFailed ? (
            <Button type="button" onClick={() => void handleRetryRender()} disabled={retrying}>
              {retrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Retrying render…
                </>
              ) : (
                "Retry render"
              )}
            </Button>
          ) : (
            <Button type="button" onClick={() => void loadVideo(run?.id ?? null)}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Rendered video</h1>
          <p className="mt-1 text-sm text-muted-foreground">1080p MP4 · download or schedule publish</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href={`/projects/${projectId}/editor`} />}>
            Back to editor
          </Button>
          <Button variant="outline" render={<Link href={`/projects/${projectId}/publish`} />}>
            <Share2 className="size-4" />
            Schedule publish
          </Button>
          <Button className="gap-2" render={<a href={mp4Url} download rel="noreferrer noopener" />}>
            <Download className="size-4" />
            Download MP4
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <video src={mp4Url} controls playsInline className="aspect-video h-auto w-full" />
      </div>

      <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
        Your file is ready. Use <span className="font-medium text-foreground">Download MP4</span> to
        save it, or open <span className="font-medium text-foreground">Schedule publish</span> to
        connect social accounts (post-MVP).
      </div>
    </div>
  );
}
