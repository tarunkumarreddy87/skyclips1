"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useEditorStore } from "@/lib/editor/store";
import { formatTimecode, msToPx } from "@/lib/editor/utils";
import { TIMELINE_RULER_HEIGHT } from "@/lib/editor/timeline-layout";

export type TimelinePlayheadHandle = {
  /** Imperative needle position while scrubbing (bypasses store-driven React updates). */
  setPositionPx: (px: number, playheadMs?: number) => void;
  /** Re-sync from store after scrub ends. */
  syncFromStore: () => void;
};

/**
 * Isolated playhead needle — DOM position via transform + store.subscribe,
 * so playhead ticks never re-render the timeline shell or clip rows.
 */
export const TimelinePlayhead = forwardRef<
  TimelinePlayheadHandle,
  {
    tracksAreaHeight: number;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  }
>(function TimelinePlayhead({ tracksAreaHeight, onPointerDown }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);

  const applyPosition = (ms: number) => {
    const zoom = useEditorStore.getState().timeline.settings.zoom;
    const px = msToPx(ms, zoom);
    const el = rootRef.current;
    if (el) el.style.transform = `translate3d(${px}px,0,0)`;
    if (labelRef.current) labelRef.current.textContent = formatTimecode(ms);
  };

  useImperativeHandle(ref, () => ({
    setPositionPx(px, ms) {
      scrubbingRef.current = true;
      const el = rootRef.current;
      if (el) el.style.transform = `translate3d(${px}px,0,0)`;
      if (labelRef.current && ms != null) {
        labelRef.current.textContent = formatTimecode(ms);
      }
    },
    syncFromStore() {
      scrubbingRef.current = false;
      applyPosition(useEditorStore.getState().ui.playheadMs);
    },
  }));

  useEffect(() => {
    applyPosition(useEditorStore.getState().ui.playheadMs);
    return useEditorStore.subscribe((state, prev) => {
      if (scrubbingRef.current) return;
      if (
        state.ui.playheadMs === prev.ui.playheadMs &&
        state.timeline.settings.zoom === prev.timeline.settings.zoom
      ) {
        return;
      }
      applyPosition(state.ui.playheadMs);
    });
  }, []);

  const initialMs = useEditorStore.getState().ui.playheadMs;
  const initialZoom = useEditorStore.getState().timeline.settings.zoom;
  const initialPx = msToPx(initialMs, initialZoom);

  return (
    <div
      ref={rootRef}
      data-timeline-playhead
      className="absolute left-0 top-0 z-30 cursor-ew-resize touch-none will-change-transform"
      style={{
        transform: `translate3d(${initialPx}px,0,0)`,
        height: TIMELINE_RULER_HEIGHT + tracksAreaHeight,
      }}
      onPointerDown={onPointerDown}
      title={`Playhead ${formatTimecode(initialMs)}`}
    >
      <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-[#EF4444] shadow-[0_0_10px_rgba(239,68,68,0.45)]" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <div className="h-2.5 w-2.5 rounded-full border-2 border-[#EF4444] bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.55)]" />
      </div>
      <div
        ref={labelRef}
        className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded bg-[#EF4444] px-1 py-0.5 font-mono text-[9px] font-semibold tabular-nums text-white shadow-md"
      >
        {formatTimecode(initialMs)}
      </div>
      <div className="absolute left-1/2 top-0 h-full w-4 -translate-x-1/2" />
    </div>
  );
});
