"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/editor/store";

/** Bump key to clear bad localStorage fractions that collapse the preview. */
const STORAGE_KEY = "hanuman.editor.previewFrac.v3";
const MIN_PREVIEW_FRAC = 0.42;
const MAX_PREVIEW_FRAC = 0.78;
/** Preview dominates; timeline docks at the bottom. */
const DEFAULT_PREVIEW_FRAC = 0.64;
/** Transport + ruler + ≥1 track row. */
const MIN_TIMELINE_PX = 200;

function readStoredFrac(): number {
  if (typeof window === "undefined") return DEFAULT_PREVIEW_FRAC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREVIEW_FRAC;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_PREVIEW_FRAC;
    return Math.min(MAX_PREVIEW_FRAC, Math.max(MIN_PREVIEW_FRAC, n));
  } catch {
    return DEFAULT_PREVIEW_FRAC;
  }
}

/**
 * Vertical split: preview (top) + timeline (bottom) with a premium RVE-style grabber.
 */
export function EditorPreviewTimelineSplit({
  preview,
  timeline,
}: {
  preview: React.ReactNode;
  timeline: React.ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const latestFracRef = useRef(DEFAULT_PREVIEW_FRAC);
  const [previewFrac, setPreviewFrac] = useState(DEFAULT_PREVIEW_FRAC);
  const [dragging, setDragging] = useState(false);
  const agentPanelOpen = useEditorStore((s) => s.ui.agentPanelOpen);

  useEffect(() => {
    const initial = readStoredFrac();
    latestFracRef.current = initial;
    setPreviewFrac(initial);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const shell = shellRef.current;
    if (!shell) return;
    const startY = e.clientY;
    const startFrac = latestFracRef.current;
    const rect = shell.getBoundingClientRect();
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const height = Math.max(1, rect.height);
      const maxFracForTimeline = Math.max(
        MIN_PREVIEW_FRAC,
        Math.min(MAX_PREVIEW_FRAC, 1 - MIN_TIMELINE_PX / height),
      );
      const next = Math.min(
        maxFracForTimeline,
        Math.max(MIN_PREVIEW_FRAC, startFrac + (ev.clientY - startY) / height),
      );
      latestFracRef.current = next;
      setPreviewFrac(next);
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(latestFracRef.current));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {/* Preview — no h-full (conflicts with flex grow and zeros stage fit) */}
      <div
        className="relative min-h-0 min-w-0 overflow-hidden"
        style={{ flex: `${previewFrac} 1 0%` }}
      >
        {preview}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize preview and timeline"
        className={cn(
          "group relative z-20 flex h-2.5 shrink-0 cursor-row-resize items-center justify-center bg-transparent",
          dragging && "bg-white/[0.02]",
        )}
        onPointerDown={onPointerDown}
      >
        <div
          className={cn(
            "h-1 w-11 rounded-full bg-zinc-600/70 transition-all duration-200",
            "group-hover:w-14 group-hover:bg-zinc-400",
            dragging && "w-16 bg-zinc-200",
          )}
        />
      </div>

      {/* Timeline docked at bottom */}
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-col overflow-hidden px-2 pb-2 pt-0 sm:px-2.5 sm:pb-2.5",
          agentPanelOpen && "rounded-[22px]",
        )}
        style={{
          flex: `${Math.max(0.08, 1 - previewFrac)} 1 0%`,
          minHeight: MIN_TIMELINE_PX,
        }}
      >
        {timeline}
      </div>
    </div>
  );
}
