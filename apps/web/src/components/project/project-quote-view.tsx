"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  approveQuote,
  generateQuote,
  getProject,
  startGeneration,
  updateQuote,
} from "@/lib/api-client";
import { projectHref } from "@/lib/project-routes";

/**
 * Quote page is retired from the UX. Auto-approve and send users to the queue.
 */
export function ProjectQuoteView({ projectId }: { projectId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const project = await getProject(projectId);
        if (cancelled) return;

        if (project.status === "draft" || project.status === "quoted") {
          if (!project.activeQuote) {
            await generateQuote(projectId);
          }
          const refreshed = await getProject(projectId);
          const quote = refreshed.activeQuote;
          if (quote && quote.status === "pending_approval") {
            const durationSec =
              refreshed.brief?.targetDurationSec ?? quote.durationSec ?? 600;
            const quoteToApprove = await updateQuote(projectId, {
              formatMode: refreshed.formatMode,
              durationSec,
            });
            await approveQuote(projectId, quoteToApprove.id);
          }
          try {
            await startGeneration(projectId);
          } catch {
            /* may already be running */
          }
          if (!cancelled) router.replace(`/projects/${projectId}/queue`);
          return;
        }

        if (!cancelled) router.replace(projectHref(project.status, projectId));
      } catch {
        if (!cancelled) router.replace("/projects");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-foreground/70" />
      <p className="text-sm">Starting production…</p>
    </div>
  );
}
