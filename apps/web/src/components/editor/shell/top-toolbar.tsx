"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeInfo, ChevronLeft, CircleHelp, Cloud, Loader2, Sparkles } from "lucide-react";
import { useEditorStore, endGestureHistory } from "@/lib/editor/store";
import { EDITOR_TOOLS } from "@/lib/editor/tools";
import type { LeftTool } from "@/lib/editor/types";
import { IconButton } from "./icon-button";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getLatestRun, startRender, subscribeProgress } from "@/lib/api-client";
import { validateEditorStateForRender } from "@/lib/editor/validate-render";
import { cn } from "@/lib/utils";

interface TopToolbarProps {
  projectId: string;
}

export function TopToolbar({ projectId }: TopToolbarProps) {
  const router = useRouter();
  const navigatedRef = useRef(false);
  const [renderStarting, setRenderStarting] = useState(false);
  const [renderRunId, setRenderRunId] = useState<string | null>(null);
  const [renderPercent, setRenderPercent] = useState<number | null>(null);
  const [renderStatus, setRenderStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const project = useEditorStore((s) => s.project);
  const activeTool = useEditorStore((s) => s.ui.activeTool);
  const toolPanelOpen = useEditorStore((s) => s.ui.toolPanelOpen);
  const saveStatus = useEditorStore((s) => s.ui.saveStatus);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const toggleToolPanel = useEditorStore((s) => s.toggleToolPanel);
  const setInfoOpen = useEditorStore((s) => s.setInfoOpen);
  const setSupportOpen = useEditorStore((s) => s.setSupportOpen);
  const agentPanelOpen = useEditorStore((s) => s.ui.agentPanelOpen);
  const toggleAgentPanel = useEditorStore((s) => s.toggleAgentPanel);

  const handleToolClick = (toolId: LeftTool | "select") => {
    if (toolId === "select") {
      toggleToolPanel(false);
      return;
    }
    if (toolPanelOpen && activeTool === toolId) toggleToolPanel(false);
    else {
      setActiveTool(toolId);
      toggleToolPanel(true);
    }
  };

  const renderLabel = useMemo(() => {
    if (renderStarting) return "Starting…";
    if (renderStatus === "running") {
      const pct = renderPercent ?? 0;
      return `Rendering ${pct}%`;
    }
    if (renderStatus === "completed") return "Rendered";
    return "Render video";
  }, [renderStarting, renderPercent, renderStatus]);

  useEffect(() => {
    if (!renderRunId) return;
    setRenderStatus("running");
    const unsubscribe = subscribeProgress(projectId, (event) => {
      if (event.runId !== renderRunId) return;
      if (typeof event.percent === "number") setRenderPercent(event.percent);
      if (event.status === "failed") setRenderStatus("failed");
    });

    const poll = setInterval(() => {
      void getLatestRun(projectId).then((latest) => {
        if (!latest || latest.id !== renderRunId) return;
        if (latest.status === "completed") {
          setRenderStatus("completed");
          setRenderPercent(100);
        }
        if (latest.status === "failed") setRenderStatus("failed");
      });
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [projectId, renderRunId]);

  useEffect(() => {
    if (renderStatus !== "completed" || !renderRunId || navigatedRef.current) return;
    navigatedRef.current = true;
    toast.success("Render complete", { description: "Opening your video…" });
    router.push(`/projects/${projectId}/video`);
  }, [projectId, renderRunId, renderStatus, router]);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center border-b border-white/[0.06] bg-[#111111] px-3 sm:h-[48px] sm:px-4">
      {/* Left — tools (same order; panel toggles open/close) */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <Link
          href="/projects"
          className="mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          title="Back to projects"
        >
          <ChevronLeft className="size-4" />
        </Link>

        {EDITOR_TOOLS.map(({ id, icon: Icon, label }) => (
          <IconButton
            key={id}
            active={id !== "select" && toolPanelOpen && activeTool === id}
            onClick={() => handleToolClick(id)}
            title={label}
            className="size-8 rounded-lg"
          >
            <Icon className="size-[16px]" strokeWidth={1.75} />
          </IconButton>
        ))}
      </div>

      {/* Center — project title. Absolutely centered but with safe padding so it
          never shoves into the left tools or right cluster at narrow widths. */}
      <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4 sm:hidden">
        {/* Mobile: just a back chevron is enough context; title is hidden to save space. */}
      </div>
      <button
        type="button"
        className="pointer-events-auto absolute left-1/2 hidden max-w-[min(360px,34vw)] -translate-x-1/2 items-center gap-1.5 truncate rounded-lg px-2 py-1 text-[13px] font-medium tracking-tight text-zinc-200 transition hover:bg-white/[0.04] md:flex"
        onClick={() => setInfoOpen(true)}
        title="Project info"
      >
        <span className="truncate">{project.title || "Untitled"}</span>
        <BadgeInfo className="size-3.5 shrink-0 text-zinc-500" />
      </button>

      {/* Right — help / save / agent / render */}
      <div className="flex flex-1 items-center justify-end gap-1">
        <IconButton
          onClick={() => setSupportOpen(true)}
          title="Ask Support"
          className="hidden size-8 rounded-lg sm:inline-flex"
        >
          <CircleHelp className="size-[16px]" strokeWidth={1.75} />
        </IconButton>

        <div
          className="mr-1 hidden items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium text-zinc-500 md:flex"
          title={saveStatus}
        >
          {saveStatus === "saving" ? (
            <Loader2 className="size-3 animate-spin text-zinc-400" />
          ) : saveStatus === "unsaved" ? (
            <Cloud className="size-3 text-amber-500/80" />
          ) : saveStatus === "error" ? (
            <Cloud className="size-3 text-red-500/80" />
          ) : (
            <Cloud className="size-3 text-emerald-500/70" />
          )}
        </div>

        <Button
          type="button"
          size="sm"
          className="ml-1 h-8 rounded-lg px-3.5 text-xs font-semibold"
          disabled={renderStarting || renderStatus === "running"}
          onClick={async () => {
            if (renderStarting) return;
            setRenderStarting(true);
            try {
              await useEditorStore.getState().flushSave();
              endGestureHistory();
              await useEditorStore.getState().flushSave();
              const state = useEditorStore.getState();
              const checked = validateEditorStateForRender(projectId, state);
              if (!checked.ok) {
                toast.error("Fix ghost clips before render", {
                  description: checked.issues.slice(0, 3).map((i) => i.message).join(" "),
                });
                return;
              }
              const started = await startRender(projectId, checked.manifest);
              navigatedRef.current = false;
              setRenderRunId(started.run.id);
              setRenderPercent(0);
              setRenderStatus("running");
              toast.message("Rendering your edits", {
                description: "Remotion export of the live timeline.",
              });
              router.push(`/projects/${projectId}/video`);
            } catch (e) {
              const message = e instanceof Error ? e.message : "Failed to start render";
              if (message.toLowerCase().includes("already in progress")) {
                toast.message("Render already running", { description: "Check the queue for progress." });
              } else {
                toast.error(message);
              }
            } finally {
              setRenderStarting(false);
            }
          }}
        >
          {(renderStarting || renderStatus === "running") && (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          )}
          {renderLabel}
        </Button>

        <IconButton
          active={agentPanelOpen}
          onClick={() => toggleAgentPanel()}
          title="Editor Agent"
          className={cn("ml-0.5 size-8 rounded-lg", agentPanelOpen && "text-primary")}
        >
          <Sparkles className="size-[16px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  );
}
