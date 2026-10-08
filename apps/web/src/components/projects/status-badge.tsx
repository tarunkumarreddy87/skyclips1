"use client";

import type { ProjectStatus } from "@hanuman/shared-types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  approved: "Approved",
  queued: "Queued",
  running: "Running",
  completed: "Ready",
  failed: "Failed",
};

const statusStyles: Record<ProjectStatus, string> = {
  draft: "border-border/70 bg-muted/60 text-muted-foreground",
  quoted: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  queued: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  running: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  failed: "border-red-500/30 bg-red-500/10 text-red-200",
};

export function StatusBadge({
  status,
  compact = false,
}: {
  status: ProjectStatus | string;
  compact?: boolean;
}) {
  const key = (status in statusLabels ? status : "draft") as ProjectStatus;
  return (
    <Badge
      variant="outline"
      data-status={key}
      className={cn(
        "rounded-full font-medium capitalize",
        compact ? "border px-2 py-0.5 text-[10px]" : "text-xs",
        statusStyles[key],
      )}
    >
      {statusLabels[key] ?? status}
    </Badge>
  );
}
