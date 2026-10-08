"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { preloadEditorEntry } from "@/lib/editor/prepare-editor-entry";
import { cn } from "@/lib/utils";

/**
 * Loads the timeline (and warms the first media) before navigating, so the
 * editor opens on a painted frame rather than a blank canvas.
 */
export function OpenEditorButton({
  projectId,
  label = "Open editor",
  className,
  variant,
}: {
  projectId: string;
  label?: string;
  className?: string;
  variant?: "outline";
}) {
  const router = useRouter();
  const [percent, setPercent] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    router.prefetch(`/projects/${projectId}/editor`);
    return () => abortRef.current?.abort();
  }, [projectId, router]);

  const open = useCallback(async () => {
    if (percent !== null) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setPercent(0);
    setStatus("Loading timeline…");
    try {
      await preloadEditorEntry(projectId, {
        signal: ac.signal,
        onProgress: (p) => {
          setPercent(p.percent);
          setStatus(p.label);
        },
      });
      if (ac.signal.aborted) return;
      router.push(`/projects/${projectId}/editor`);
    } catch (err) {
      if (ac.signal.aborted) return;
      setPercent(null);
      setError(err instanceof Error ? err.message : "Could not load the timeline.");
    }
  }, [percent, projectId, router]);

  const loading = percent !== null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        variant={variant}
        className={cn(
          "w-fit",
          variant === "outline"
            ? "border-border bg-transparent text-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        disabled={loading}
        onClick={() => void open()}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {status || "Loading…"}
          </>
        ) : (
          label
        )}
      </Button>

      {loading ? (
        <div className="flex w-full max-w-xs items-center gap-2">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Loading editor"
          >
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-out"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {percent ?? 0}%
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="inline-flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
