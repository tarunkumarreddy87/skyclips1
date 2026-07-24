"use client";

import { memo, useCallback, useRef, useState } from "react";
import type { CaptionTimelineGroup } from "@/lib/editor/caption-groups";
import { useEditorStore, endGestureHistory } from "@/lib/editor/store";
import { findOverlappingClipIds } from "@/lib/editor/clip-collision";
import { msToPx, pxToMs } from "@/lib/editor/utils";
import { cn } from "@/lib/utils";

interface CaptionGroupBlockProps {
  group: CaptionTimelineGroup;
  zoom: number;
  trackHeight: number;
  selected: boolean;
  onSelectMember: (itemId: string) => void;
}

/**
 * Continuous caption lane tile — geometry from real cue min/max.
 * Drag shifts every member by one shared clamped delta.
 */
function CaptionGroupBlockInner({
  group,
  zoom,
  trackHeight,
  selected,
  onSelectMember,
}: CaptionGroupBlockProps) {
  const moveItem = useEditorStore((s) => s.moveItem);
  const durationMs = useEditorStore((s) => s.timeline.durationMs);

  const left = msToPx(group.startMs, zoom);
  const width = Math.max(msToPx(Math.max(0, group.endMs - group.startMs), zoom), 4);
  const count = group.items.length;
  const [collision, setCollision] = useState(false);

  const dragRef = useRef<{
    startX: number;
    origStarts: Map<string, number>;
    spans: Map<string, number>;
    groupStart: number;
    groupEnd: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef<number | null>(null);

  const pickMemberId = useCallback((): string => {
    const playheadMs = useEditorStore.getState().ui.playheadMs;
    const under = group.items.find(
      (i) => playheadMs >= i.startMs && playheadMs < i.endMs,
    );
    return under?.id ?? group.items[0]!.id;
  }, [group.items]);

  const applyDelta = useCallback(
    (rawDeltaMs: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      // One shared clamp so relative cue gaps stay intact at timeline edges.
      const minDelta = -drag.groupStart;
      const maxDelta = durationMs - drag.groupEnd;
      const deltaMs = Math.max(minDelta, Math.min(maxDelta, rawDeltaMs));
      const tracks = useEditorStore.getState().timeline.tracks;
      const groupIds = new Set(group.items.map((item) => item.id));
      let anyHit = false;
      for (const item of group.items) {
        const orig = drag.origStarts.get(item.id) ?? item.startMs;
        const span = drag.spans.get(item.id) ?? item.endMs - item.startMs;
        const nextStart = orig + deltaMs;
        const hits = findOverlappingClipIds(
          tracks,
          item.id,
          nextStart,
          nextStart + span,
          groupIds,
        );
        if (hits.length) anyHit = true;
      }
      setCollision(anyHit);
      if (anyHit) return;
      for (const item of group.items) {
        const orig = drag.origStarts.get(item.id) ?? item.startMs;
        moveItem(item.id, orig + deltaMs);
      }
    },
    [durationMs, group.items, moveItem],
  );

  const onPointerMove = useCallback(
    (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaPx = ev.clientX - drag.startX;
      if (!drag.moved) {
        if (Math.abs(deltaPx) < 4) return;
        drag.moved = true;
      }
      pendingDeltaRef.current = pxToMs(deltaPx, zoom);
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingDeltaRef.current != null) applyDelta(pendingDeltaRef.current);
      });
    },
    [applyDelta, zoom],
  );

  const endDrag = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingDeltaRef.current != null && dragRef.current?.moved) {
      applyDelta(pendingDeltaRef.current);
    }
    pendingDeltaRef.current = null;
    dragRef.current = null;
    setCollision(false);
    endGestureHistory();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [applyDelta, onPointerMove]);

  const startDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    const origStarts = new Map<string, number>();
    const spans = new Map<string, number>();
    let groupStart = Infinity;
    let groupEnd = 0;
    for (const item of group.items) {
      origStarts.set(item.id, item.startMs);
      spans.set(item.id, item.endMs - item.startMs);
      groupStart = Math.min(groupStart, item.startMs);
      groupEnd = Math.max(groupEnd, item.endMs);
    }
    dragRef.current = {
      startX: e.clientX,
      origStarts,
      spans,
      groupStart: Number.isFinite(groupStart) ? groupStart : 0,
      groupEnd,
      moved: false,
      pointerId: e.pointerId,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  const preview =
    group.id === "caption-continuous-lane"
      ? group.previewText || `Captions · ${count}`
      : group.previewText.length > 42
        ? `${group.previewText.slice(0, 40)}…`
        : group.previewText;

  return (
    <button
      type="button"
      data-timeline-clip-block
      className={cn(
        "absolute top-0 flex items-center overflow-hidden rounded-[8px] border border-transparent px-2 text-left text-[10px] font-medium transition-all",
        "bg-[#2a2f38] text-zinc-100 hover:brightness-110",
        selected &&
          !collision &&
          "z-20 border-white shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]",
        collision &&
          "z-30 shadow-[0_0_0_2px_#f87171,0_0_14px_rgba(239,68,68,0.4)]",
      )}
      style={{ left, width, height: trackHeight }}
      title={group.previewText}
      onPointerDown={startDrag}
      onClick={(e) => {
        e.stopPropagation();
        onSelectMember(pickMemberId());
      }}
    >
      <span className="relative z-[1] min-w-0 flex-1 truncate font-medium tracking-tight text-zinc-100">
        {preview || `${count} lines`}
      </span>
    </button>
  );
}

export const CaptionGroupBlock = memo(CaptionGroupBlockInner);
