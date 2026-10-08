"use client";

import { memo, useMemo } from "react";
import type { TimelineItem, Track, TransitionItem } from "@/lib/editor/types";
import {
  TIMELINE_TRACK_GAP,
  TRACK_META,
  trackRowHeight,
  layoutTrack,
} from "@/lib/editor/timeline-layout";
import { filterItemsInView, type TimeRange } from "@/lib/editor/timeline-virtualization";
import { clipsAbut } from "@/lib/editor/transition-abut";
import { useEditorStore } from "@/lib/editor/store";
import { combineCaptionsForTimeline } from "@/lib/editor/caption-groups";

import { TimelineClipBlock } from "./timeline-clip-block";

import { Plus } from "lucide-react";
import { toast } from "sonner";

export type TimelineTrackLaneHandlers = {
  onSelectItem: (itemId: string) => void;
  onOpenInspector: () => void;
  onSelectOrAddTransition: (afterItemId: string, hasNext: boolean) => void;
  onEmptyLaneAdd: () => void;
};

type TimelineTrackLaneProps = {
  track: Track;
  index: number;
  zoom: number;
  durationMs: number;
  viewRangeMs: TimeRange;
  selectedItemId: string | null;
  selectedTransitionId: string | null;
  showTransitions: boolean;
  transitions: TransitionItem[];
  handlers: TimelineTrackLaneHandlers;
};

/**
 * One absolute-positioned track row. Horizontal windowing: only clips that
 * intersect `viewRangeMs` mount as TimelineClipBlock (no offscreen spacers —
 * layout width comes from the parent timeline canvas).
 */
function TimelineTrackLaneInner({
  track,
  index,
  zoom,
  durationMs,
  viewRangeMs,
  selectedItemId,
  selectedTransitionId,
  showTransitions,
  transitions,
  handlers,
}: TimelineTrackLaneProps) {
  const fps = useEditorStore(s => s.timeline.fps);
  const rowH = trackRowHeight(track.type);
  const layout = layoutTrack(track);
  const meta = TRACK_META[track.type];
  const isCaptions = track.type === "captions";
  const isVideo = track.type === "video";
  const captionGroup = useMemo(
    () => (isCaptions ? combineCaptionsForTimeline(track.items, durationMs) : null),
    [durationMs, isCaptions, track.items],
  );

  const visibleItems = useMemo(() => {
    if (!isCaptions) return filterItemsInView(track.items, viewRangeMs);
    if (!captionGroup) return [];
    const first = captionGroup.items[0]!;
    // Captions are edited as one project-wide layer. Keep the timed cues in the
    // document, but present one continuous, non-trimmable block in the timeline.
    return filterItemsInView(
      [{ ...first, startMs: captionGroup.startMs, endMs: captionGroup.endMs, label: "Captions", text: captionGroup.previewText }],
      viewRangeMs,
    );
  }, [captionGroup, isCaptions, track.items, viewRangeMs]);

  const sortedVideo = useMemo(() => {
    if (!isVideo) return [] as TimelineItem[];
    return [...track.items].sort((a, b) => a.startMs - b.startMs);
  }, [isVideo, track.items]);

  const transitionByAfterItemId = useMemo(
    () => new Map(transitions.filter((t) => t.enabled).map((t) => [t.afterItemId, t])),
    [transitions],
  );

  const videoIndexById = useMemo(
    () => new Map(sortedVideo.map((item, index) => [item.id, index])),
    [sortedVideo],
  );

  const visibleCaptionCount = isCaptions
    ? track.items.filter((i) => i.type === "captions" && !i.hidden).length
    : track.items.length;
  const emptyLane = visibleCaptionCount === 0;
  const captionLaneSelected = Boolean(
    isCaptions &&
      selectedItemId &&
      track.items.some((candidate) => candidate.id === selectedItemId),
  );

  return (
    <div
      className="relative"
      style={{
        height: layout.height,
        marginBottom: TIMELINE_TRACK_GAP,
        background:
          index % 2 === 0
            ? `linear-gradient(90deg, ${meta.accentSoft}, transparent 22%), rgba(255,255,255,0.012)`
            : `linear-gradient(90deg, ${meta.accentSoft}, transparent 14%)`,
        boxShadow:
          isCaptions || isVideo ? `inset 0 -1px 0 ${meta.accent}22` : undefined,
      }}
    >
      {emptyLane ? (
        <button
          type="button"
          className="absolute inset-x-2 inset-y-1 z-10 flex items-center justify-center rounded-[10px] border border-dashed transition-colors hover:brightness-110"
          style={{
            borderColor: `${meta.accent}66`,
            backgroundColor: meta.accentSoft,
          }}
          title={`Add ${meta.short}`}
          onClick={(e) => {
            e.stopPropagation();
            handlers.onEmptyLaneAdd();
            toast.message(`Add ${meta.short}`, {
              description: "Use Media, Text, or Audio tools — or drop a file on this lane.",
            });
          }}
        >
          <Plus className="size-4" style={{ color: meta.accent }} strokeWidth={2.25} />
        </button>
      ) : null}

      {visibleItems.map((item) => {
            const transition = showTransitions ? transitionByAfterItemId.get(item.id) ?? null : null;
            const videoIdx = isVideo ? videoIndexById.get(item.id) ?? -1 : -1;
            const nextClip = isVideo && videoIdx >= 0 ? sortedVideo[videoIdx + 1] : undefined;
            const hasNext = Boolean(nextClip) && clipsAbut(item.endMs, nextClip!.startMs, 1000 / fps);
            return (
              <div key={item.id} data-timeline-clip className="absolute inset-x-0" style={{ top: layout.offsets.get(item.id) ?? 0, height: rowH }}>
                <TimelineClipBlock
                  item={item}
                  zoom={zoom}
                  trackHeight={rowH}
                  selected={captionLaneSelected || selectedItemId === item.id}
                  presentationOnly={isCaptions}
                  captionSegments={isCaptions ? captionGroup?.items : undefined}
                  transition={hasNext ? transition : null}
                  showBoundary={Boolean(showTransitions && hasNext)}
                  transitionSelected={Boolean(
                    transition && selectedTransitionId === transition.id,
                  )}
                  onSelect={handlers.onSelectItem}
                  onOpenInspector={handlers.onOpenInspector}
                  onSelectTransition={handlers.onSelectOrAddTransition}
                  hasNextAbut={hasNext}
                />
              </div>
            );
          })}
    </div>
  );
}

export const TimelineTrackLane = memo(TimelineTrackLaneInner);
