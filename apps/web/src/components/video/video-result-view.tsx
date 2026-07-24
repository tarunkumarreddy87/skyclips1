"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Share2, TriangleAlert } from "lucide-react";
import {
  downloadVideo,
  getLatestRun,
  startRender,
  subscribeProgress,
  type ArtifactResponse,
  type GenerationRun,
} from "@/lib/api-client";
import { fetchSavedTimelineManifest } from "@/lib/editor/fetch-saved-timeline-manifest";
import { Button } from "@/components/ui/button";

export function VideoResultView({ projectId }: { projectId: string }) {
  const [video, setVideo] = useState<ArtifactResponse | null>(null);
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [percent, setPercent] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const mp4Url = useMemo(() => video?.downloadUrl ?? "", [video?.downloadUrl]);
  const rendering = run?.status === "running" || run?.status === "queued";

  const loadVideo = useCallback(async () => {
    try {
      const artifact = await downloadVideo(projectId);
      setVideo(artifact);
      setError(null);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Video not ready";
      setError(message);
      setVideo(null);
      return false;
    }
  }, [projectId]);

  const handleRetryRender = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      const manifest = await fetchSavedTimelineManifest(projectId);
      const started = await startRender(projectId, manifest);
      setRun(started.run);
      setPercent(85);
      setVideo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry render");
    } finally {
      setRetrying(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(projectId);
        if (cancelled) return;
        setRun(latest);
        const ok = await loadVideo();
        if (!ok && latest?.status === "running") {
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadVideo]);

  useEffect(() => {
    if (!run || run.status === "completed" || run.status === "failed") return;

    const unsubscribe = subscribeProgress(projectId, (event) => {
      if (event.runId !== run.id) return;
      if (typeof event.percent === "number") setPercent(event.percent);
      if (event.stage === "enqueue_render" && event.status === "completed") {
        void loadVideo();
        void getLatestRun(projectId).then((latest) => {
          if (latest) setRun(latest);
        });
      }
      if (event.status === "failed") {
        setError(event.message || "Render failed");
        void getLatestRun(projectId).then((latest) => {
          if (latest) setRun(latest);
        });
      }
    });

    const poll = setInterval(() => {
      void getLatestRun(projectId).then((latest) => {
        if (!latest) return;
        setRun(latest);
        if (latest.status === "completed") void loadVideo();
      });
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [projectId, run, loadVideo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading video…
      </div>
    );
  }

  if (rendering && !video) {
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
            <Button type="button" onClick={() => void loadVideo()}>
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
