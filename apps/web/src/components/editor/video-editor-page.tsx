"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { downloadVideo, startGeneration } from "@/lib/api-client";
import { requestEditorMockFallback } from "@/lib/editor/load-editor-state";
import { EditorToolDrawer } from "./editor-tool-drawer";
import { EditorSettingsSheet } from "./editor-settings-sheet";
import { ProjectInfoDialog } from "./dialogs/project-info-dialog";
import { SupportDrawer } from "./dialogs/support-drawer";
import { RestoreConfirmDialog } from "./dialogs/restore-confirm-dialog";
import { ResetTimelineDialog } from "./dialogs/reset-timeline-dialog";
import { ReplaceMediaDialog } from "./dialogs/replace-media-dialog";
import { TopToolbar } from "./shell/top-toolbar";
import { PreviewSection } from "./shell/preview-section";
import { TimelineSection } from "./shell/timeline-section";
import { EditorPreviewTimelineSplit } from "./shell/editor-preview-timeline-split";
import { EditorAgentDock } from "./editor-agent-dock";
import { useEditorKeyboard } from "./hooks/use-editor-keyboard";
import { ensureEditorTextFontsLoaded } from "@/lib/editor/text-fonts";
import { isPreviewAudioGateBlocked } from "@/lib/editor/preview-audio-transport";
import { useIsTablet } from "@/lib/editor/use-is-mobile";

interface VideoEditorPageProps {
  projectId: string;
}

export function VideoEditorPage({ projectId }: VideoEditorPageProps) {
  const init = useEditorStore((s) => s.init);
  const loadStatus = useEditorStore((s) => s.ui.loadStatus);
  const loadError = useEditorStore((s) => s.ui.loadError);
  const loadErrorCode = useEditorStore((s) => s.ui.loadErrorCode);
  const canRetryGeneration = useEditorStore((s) => s.ui.canRetryGeneration);
  const projectStatus = useEditorStore((s) => s.ui.projectStatus);
  const isPlaying = useEditorStore((s) => s.ui.isPlaying);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const durationMs = useEditorStore((s) => s.timeline.durationMs);
  const agentPanelOpen = useEditorStore((s) => s.ui.agentPanelOpen);
  const isTablet = useIsTablet();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEditorKeyboard();

  useEffect(() => {
    ensureEditorTextFontsLoaded();
  }, []);

  useEffect(() => {
    void init(projectId);
  }, [projectId, init]);

  useEffect(() => {
    if (loadStatus !== "ready") return;
    let cancelled = false;
    void downloadVideo(projectId)
      .then((art) => {
        if (cancelled) return;
        const sec = art.durationSec;
        if (typeof sec === "number" && sec > 0) {
          useEditorStore.getState().setLastRenderedDurationMs(Math.round(sec * 1000));
        }
      })
      .catch(() => {
        /* no final video yet — stay on estimate */
      });
    return () => {
      cancelled = true;
    };
  }, [loadStatus, projectId]);

  useEffect(() => {
    if (!isPlaying || loadStatus !== "ready") return;

    // Restart from 0 when Play is pressed at/after the end (NLE convention).
    const boot = useEditorStore.getState();
    if (boot.ui.playheadMs >= boot.timeline.durationMs - 1) {
      boot.setPlayhead(0);
    }

    let raf = 0;
    let last = performance.now();
    let lastStoreWrite = 0;
    // Monotonic local clock — resynced on external seeks (not audio-drift nudges).
    let localMs = useEditorStore.getState().ui.playheadMs;
    let lastWrittenMs = localMs;

    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      // Freeze the editor clock until narration can play — prevents silent picture
      // racing ahead of voice while HTMLAudio buffers.
      if (isPreviewAudioGateBlocked() || useEditorStore.getState().ui.previewScrubMs != null) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const state = useEditorStore.getState();
      const { playbackSpeed } = state.ui;
      const storePh = state.ui.playheadMs;
      // User seek / inspector jump while playing — adopt store position.
      if (storePh !== lastWrittenMs) {
        localMs = storePh;
        lastWrittenMs = storePh;
      }
      localMs += dt * playbackSpeed;
      if (localMs >= state.timeline.durationMs) {
        state.setPlaying(false);
        state.setPlayhead(state.timeline.durationMs);
        return;
      }
      // ~30fps store writes — enough for audio sync without overloading CSS preview.
      if (now - lastStoreWrite >= 33) {
        lastStoreWrite = now;
        lastWrittenMs = localMs;
        state.setPlayhead(localMs);
      }
      raf = requestAnimationFrame(tick);
    };

    // Reset the clock baseline when the tab regains focus. While hidden, RAF is
    // throttled but performance.now() keeps advancing, so without this the first
    // frame after returning would jump the playhead forward by up to 100ms.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        last = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isPlaying, loadStatus]);

  async function handleRetryGeneration() {
    setRetrying(true);
    setRetryError(null);
    try {
      await startGeneration(projectId);
      window.location.href = `/projects/${projectId}`;
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Could not start generation");
      setRetrying(false);
    }
  }

  if (loadStatus === "loading" || loadStatus === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-[#2563EB]" />
        <p className="text-sm">Loading project timeline…</p>
      </div>
    );
  }

  if (loadStatus === "error") {
    const isTimelineMissing = loadErrorCode === "timeline_not_ready";
    const isApiDown = loadErrorCode === "api_unreachable";
    const title = isTimelineMissing
      ? "Timeline not ready"
      : isApiDown
        ? "API offline"
        : "Could not load editor";

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-md text-xs text-muted-foreground">{loadError}</p>
        {projectStatus ? (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Project status: {projectStatus}
          </p>
        ) : null}
        {retryError ? <p className="max-w-md text-xs text-red-400">{retryError}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void init(projectId)}
            className="rounded-lg border border-border px-4 py-2 text-xs text-foreground hover:bg-accent"
          >
            Retry
          </button>
          {isApiDown ? (
            <button
              type="button"
              onClick={() => {
                requestEditorMockFallback();
                void init(projectId);
              }}
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]"
            >
              Open mock timeline
            </button>
          ) : null}
          {canRetryGeneration ? (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void handleRetryGeneration()}
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {retrying ? "Starting generation…" : "Retry generation"}
            </button>
          ) : null}
          <Link
            href="/projects"
            className="rounded-lg border border-border px-4 py-2 text-xs text-foreground hover:bg-accent"
          >
            Back to projects
          </Link>
          <Link
            href="/studio"
            className="rounded-lg border border-border px-4 py-2 text-xs text-foreground hover:bg-accent"
          >
            Go to Studio
          </Link>
        </div>
        {!isTimelineMissing ? (
          <p className="max-w-md text-[10px] text-muted-foreground">
            {isApiDown ? (
              "Docker Desktop must be running, then make up and make api."
            ) : (
              <>
                Set <code className="text-foreground">NEXT_PUBLIC_EDITOR_USE_MOCK=true</code> only for
                local UI dev without a timeline.
              </>
            )}
          </p>
        ) : null}
      </div>
    );
  }

  const workspace = (
    <EditorPreviewTimelineSplit
      preview={
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
          <PreviewSection />
          <EditorToolDrawer />
        </div>
      }
      timeline={<TimelineSection />}
    />
  );

  return (
    <div className="editor-theme-surface relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      <TopToolbar projectId={projectId} />
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 w-full min-w-0" dir="ltr">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{workspace}</div>
          <div className={isTablet ? "contents" : agentPanelOpen ? "h-full min-h-0 w-[min(360px,30vw)] shrink-0 py-2 pr-2 pl-1.5" : "hidden"}>
            <EditorAgentDock projectId={projectId} layout={isTablet ? "overlay" : "panel"} />
          </div>
        </div>
        <EditorSettingsSheet />
      </div>
      <ProjectInfoDialog />
      <SupportDrawer />
      <RestoreConfirmDialog />
      <ResetTimelineDialog />
      <ReplaceMediaDialog />
    </div>
  );
}
