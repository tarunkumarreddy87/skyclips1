"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import type { ProjectDetail } from "@hanuman/shared-types";
import { GenerationPanel } from "@/components/GenerationPanel";
import { StatusBadge } from "@/components/projects/status-badge";
import { getProject } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface GenerationQueueViewProps {
  projectId: string;
}

export function GenerationQueueView({ projectId }: GenerationQueueViewProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await getProject(projectId);
        if (cancelled) return;
        setProject(detail);
        // Quote gate only — stay on queue for running/completed so progress UI is visible.
        if (detail.status === "draft" || detail.status === "quoted") {
          window.location.replace(`/projects/${projectId}/quote`);
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load project");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || project.status === "completed" || project.status === "failed") return;
    const tick = setInterval(() => {
      void getProject(projectId)
        .then((detail) => setProject(detail))
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(tick);
  }, [project, projectId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 bg-[#1a1a1a] text-zinc-400">
        <Loader2 className="size-5 animate-spin" />
        Loading generation status…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#1a1a1a] px-4">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#222] p-10 text-center">
          <AlertTriangle className="size-8 text-red-400" />
          <p className="text-sm text-zinc-400">{error ?? "Project not found"}</p>
          <Button
            variant="outline"
            className="border-white/10 bg-transparent text-white hover:bg-white/5"
            render={<Link href="/projects" />}
          >
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  const autoStart = project.status === "approved";

  return (
    <div className="relative min-h-[70vh] bg-[#1a1a1a] text-white">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_60%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-6 md:py-10">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white"
            aria-label="Back to projects"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            Generation queue
          </p>
        </div>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex flex-col gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              {project.title}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
              Live pipeline for your {project.formatMode} ·{" "}
              {project.entryPath === "script_first" ? "script-first" : "prompt-first"} production.
              {project.status === "completed"
                ? " AI stages are done — open the editor to preview, then Render video for the MP4."
                : null}
            </p>
          </div>
          <StatusBadge status={project.status} />
        </header>

        <GenerationPanel
          projectId={project.id}
          projectStatus={project.status}
          entryPath={project.entryPath}
          autoStart={autoStart}
        />
      </div>
    </div>
  );
}
