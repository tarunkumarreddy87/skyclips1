"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Captions,
  Check,
  Download,
  Eye,
  EyeOff,
  Film,
  GripVertical,
  ImageIcon,
  Keyboard,
  Layers,
  Lock,
  LockOpen,
  Mic,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Redo2,
  Scissors,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { downloadVideo } from "@/lib/api-client";
import type { TrackType } from "@/lib/editor/types";
import { listEditorValidationIssues } from "@/lib/editor/validate-render";
import {
  TIMELINE_CONTROLS_HEIGHT,
  TIMELINE_LABEL_WIDTH,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_GAP,
  TRACK_META,
  resolveVisibleTracks,
  trackRowHeight,
} from "@/lib/editor/timeline-layout";
import {
  centerPlayheadInView,
  computeFitZoom,
  computeOverviewZoom,
  computeRulerStepSec,
  computeWindowZoom,
  formatTimecode,
  MAX_ZOOM,
  MIN_ZOOM,
  msToPx,
  pxToMs,
  scrollPlayheadIntoView,
} from "@/lib/editor/utils";
import { estimateExportDurationMs } from "@/lib/editor/export-duration";
import { sliderValue } from "@/lib/editor/slider-utils";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TimelineClipBlock } from "./timeline-clip-block";
import { CaptionGroupBlock } from "./caption-group-block";
import { combineCaptionsForTimeline } from "@/lib/editor/caption-groups";
import { TimelinePlayhead, type TimelinePlayheadHandle } from "./timeline-playhead";
import { IconButton } from "./icon-button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createPlayheadScrubController } from "@/lib/editor/playhead-scrub";
import { clipsAbut } from "@/lib/editor/transition-abut";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const TRACK_ICONS: Record<TrackType, LucideIcon> = {
  captions: Captions,
  text: Type,
  video: Film,
  broll: ImageIcon,
  animation: Sparkles,
  narration: Mic,
  music: Music2,
  sfx: Volume2,
};

function formatSpeed(speed: number): string {
  return `${speed}x`;
}

function TransportDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.1]" aria-hidden />;
}

/** Isolated so the full timeline shell does not re-render at ~30fps while playing. */
function TransportPlayheadTime({
  durationMs,
  exportDurationMs,
  exportDurationIsConfirmed,
}: {
  durationMs: number;
  exportDurationMs: number;
  exportDurationIsConfirmed: boolean;
}) {
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  return (
    <span
      className="ml-1 whitespace-nowrap font-mono text-[10px] tabular-nums tracking-tight text-zinc-300 sm:text-[11px]"
      title={
        exportDurationIsConfirmed
          ? "Confirmed length from last Remotion render"
          : "Timeline time / estimated export length (transitions may shorten the MP4)."
      }
    >
      {formatTimecode(playheadMs)}
      <span className="text-zinc-600"> / </span>
      {formatTimecode(durationMs)}
      {Math.abs(exportDurationMs - durationMs) > 500 ? (
        // The export-duration branch is wide ("· 20:08.08 est.") and the #1 cause of
        // transport overlap at half-screen — only render it when there's room.
        <span className="hidden items-center lg:inline-flex">
          <span className="text-zinc-600"> · </span>
          <span className="text-zinc-500">{formatTimecode(exportDurationMs)}</span>
          <span className="ml-1 text-[9px] font-sans uppercase tracking-wide text-zinc-500">
            {exportDurationIsConfirmed ? "render" : "est."}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function TimelineHoverGuide({
  hoverMs,
  tracksAreaHeight,
}: {
  hoverMs: number | null;
  tracksAreaHeight: number;
}) {
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const zoom = useEditorStore((s) => s.timeline.settings.zoom);
  if (hoverMs == null || Math.abs(hoverMs - playheadMs) <= 40) return null;
  const hoverX = msToPx(hoverMs, zoom);
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 w-px bg-white/40"
      style={{ left: hoverX, height: TIMELINE_RULER_HEIGHT + tracksAreaHeight }}
    >
      <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white/60" />
      <div className="absolute left-1.5 top-0.5 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] tabular-nums text-zinc-200">
        {formatTimecode(hoverMs)}
      </div>
    </div>
  );
}

export function TimelineSection() {
  const params = useParams();
  const projectId = typeof params?.id === "string" ? params.id : "";
  const tracks = useEditorStore((s) => s.timeline.tracks);
  const transitions = useEditorStore((s) => s.timeline.transitions);
  const durationMs = useEditorStore((s) => s.timeline.durationMs);
  const timeline = useEditorStore((s) => s.timeline);
  const lastRenderedDurationMs = useEditorStore((s) => s.ui.lastRenderedDurationMs);
  const zoom = useEditorStore((s) => s.timeline.settings.zoom);
  const settings = useEditorStore((s) => s.timeline.settings);
  const isPlaying = useEditorStore((s) => s.ui.isPlaying);
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const playbackSpeed = useEditorStore((s) => s.ui.playbackSpeed);
  const selectedItemId = useEditorStore((s) => s.ui.selectedItemId);
  const showTransitions = useEditorStore((s) => s.timeline.settings.showTransitions);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed);
  const setZoom = useEditorStore((s) => s.setZoom);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const selectItem = useEditorStore((s) => s.selectItem);
  const selectedTransitionId = useEditorStore((s) => s.ui.selectedTransitionId);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const addTransition = useEditorStore((s) => s.addTransition);
  const setRightPanelOpen = useEditorStore((s) => s.setRightPanelOpen);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const toggleTrackHidden = useEditorStore((s) => s.toggleTrackHidden);
  const toggleTrackLocked = useEditorStore((s) => s.toggleTrackLocked);
  const clearTrackItems = useEditorStore((s) => s.clearTrackItems);
  const splitItem = useEditorStore((s) => s.splitItem);
  const moveTrack = useEditorStore((s) => s.moveTrack);
  const reorderTracksByIds = useEditorStore((s) => s.reorderTracksByIds);
  const trackOrder = useEditorStore((s) => s.timeline.settings.trackOrder);
  const toggleAgentPanel = useEditorStore((s) => s.toggleAgentPanel);
  const addAgentMentions = useEditorStore((s) => s.addAgentMentions);
  const agentPanelOpen = useEditorStore((s) => s.ui.agentPanelOpen);
  const agentBusy = useEditorStore((s) => s.ui.agentBusy);
  const canUndo = useEditorStore((s) => (s.editPast?.length ?? 0) > 0);
  const canRedo = useEditorStore((s) => (s.editFuture?.length ?? 0) > 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<TimelinePlayheadHandle>(null);
  const scrubRef = useRef<ReturnType<typeof createPlayheadScrubController> | null>(null);
  const fittedRef = useRef(false);
  const userSeekRef = useRef(false);
  const userScrolledAwayRef = useRef(false);
  // Distinguish user scrolls from programmatic follow-scrolls so that auto-following
  // the playhead during playback does NOT flip userScrolledAwayRef and break follow.
  const programmaticScrollGenRef = useRef(0);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [showAllTracks, setShowAllTracks] = useState(false);
  /** Scroll-window cull so long timelines (100+ clips) do not mount offscreen DOM. */
  const [viewRangeMs, setViewRangeMs] = useState({ startMs: 0, endMs: durationMs });
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const assets = useEditorStore((s) => s.assets);

  const validationIssues = useMemo(() => {
    if (!projectId) return [];
    return listEditorValidationIssues(projectId, useEditorStore.getState());
  }, [projectId, tracks, assets, durationMs]);

  const timelineWidth = Math.max(msToPx(durationMs, zoom), 1);

  const visibleTracks = useMemo(
    () => resolveVisibleTracks(tracks, showAllTracks, trackOrder),
    [tracks, showAllTracks, trackOrder],
  );

  const hiddenOptionalCount = useMemo(() => {
    const shown = new Set(visibleTracks.map((t) => t.id));
    return tracks.filter(
      (t) => !t.hidden && t.items.length === 0 && !shown.has(t.id),
    ).length;
  }, [tracks, visibleTracks]);

  const tracksAreaHeight = visibleTracks.reduce(
    (sum, t) => sum + trackRowHeight(t.type) + TIMELINE_TRACK_GAP,
    TIMELINE_TRACK_GAP,
  );

  const applyZoomCentered = useCallback(
    (nextZoom: number) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      if (clamped === zoom) return;
      const el = scrollRef.current;
      const anchorMs = useEditorStore.getState().ui.playheadMs;
      setZoom(clamped);
      requestAnimationFrame(() => {
        const node = scrollRef.current ?? el;
        if (!node) return;
        programmaticScrollGenRef.current += 1;
        centerPlayheadInView(node, msToPx(anchorMs, clamped));
        userScrolledAwayRef.current = false;
      });
    },
    [setZoom, zoom],
  );

  const fitEditWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fitZoom = computeFitZoom(durationMs, el.clientWidth);
    setZoom(fitZoom);
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      programmaticScrollGenRef.current += 1;
      const ph = useEditorStore.getState().ui.playheadMs;
      centerPlayheadInView(node, msToPx(ph, fitZoom));
      userScrolledAwayRef.current = false;
      fittedRef.current = true;
    });
  }, [durationMs, setZoom]);

  const fitOverview = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = computeOverviewZoom(durationMs, el.clientWidth);
    setZoom(next);
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      programmaticScrollGenRef.current += 1;
      node.scrollLeft = 0;
      userScrolledAwayRef.current = false;
    });
  }, [durationMs, setZoom]);

  const zoomWindow = useCallback(
    (windowMs: number) => {
      const el = scrollRef.current;
      if (!el) return;
      applyZoomCentered(computeWindowZoom(windowMs, el.clientWidth));
    },
    [applyZoomCentered],
  );

  const clientXToMs = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      return Math.max(0, Math.min(durationMs, pxToMs(x, zoom)));
    },
    [durationMs, zoom],
  );

  const getPlayheadScrub = useCallback(() => {
    if (!scrubRef.current) {
      scrubRef.current = createPlayheadScrubController({
        setPlayhead,
        onVisual: (ms) => {
          const z = useEditorStore.getState().timeline.settings.zoom;
          playheadRef.current?.setPositionPx(msToPx(ms, z), ms);
          // Drive Remotion at pointer rate (store playhead stays throttled).
          useEditorStore.getState().setPreviewScrubMs(ms);
        },
      });
    }
    return scrubRef.current;
  }, [setPlayhead]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const anchorMs = pxToMs(cursorX, zoom);
      const delta = e.deltaY > 0 ? -2 : 2;
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
      if (nextZoom === zoom) return;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (!node) return;
        programmaticScrollGenRef.current += 1;
        const nextX = msToPx(anchorMs, nextZoom);
        node.scrollLeft = Math.max(0, nextX - (e.clientX - rect.left));
      });
    };
    const onScroll = () => {
      // Only treat this as a user "scroll away" when the user actually moved the
      // surface — not when we programmatically followed the playhead during playback.
      if (programmaticScrollGenRef.current > 0) {
        programmaticScrollGenRef.current -= 1;
      } else {
        userScrolledAwayRef.current = true;
      }
      const padMs = pxToMs(el.clientWidth * 0.35, zoom);
      const startMs = Math.max(0, pxToMs(el.scrollLeft, zoom) - padMs);
      const endMs = pxToMs(el.scrollLeft + el.clientWidth, zoom) + padMs;
      setViewRangeMs((prev) =>
        Math.abs(prev.startMs - startMs) < 40 && Math.abs(prev.endMs - endMs) < 40
          ? prev
          : { startMs, endMs },
      );
    };
    onScroll();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
    };
  }, [isPlaying, setZoom, zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fittedRef.current) return;
    fitEditWindow();
  }, [fitEditWindow]);

  useEffect(() => {
    if (isPlaying) userScrolledAwayRef.current = false;
  }, [isPlaying]);

  /** VidRush-style “Add to Agent” — Ctrl/⌘+L mentions current selection. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "l") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      if (!selectedItemId) {
        toggleAgentPanel(true);
        toast.message("Select a clip first", {
          description: "Or double-click a clip on the timeline.",
        });
        return;
      }
      addAgentMentions([selectedItemId]);
      toggleAgentPanel(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItemId, toggleAgentPanel, addAgentMentions]);

  // Follow playhead via store subscription — avoids re-rendering every clip at ~30fps.
  useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      if (state.ui.playheadMs === prev.ui.playheadMs) return;
      // While dragging the needle, skip auto-scroll — it fights the pointer and causes jank.
      if (scrubRef.current?.isDragging()) return;
      const el = scrollRef.current;
      if (!el) return;
      const playheadX = msToPx(state.ui.playheadMs, state.timeline.settings.zoom);
      if (userSeekRef.current) {
        programmaticScrollGenRef.current += 1;
        scrollPlayheadIntoView(el, playheadX);
        userSeekRef.current = false;
        userScrolledAwayRef.current = false;
        return;
      }
      if (state.ui.isPlaying && !userScrolledAwayRef.current) {
        programmaticScrollGenRef.current += 1;
        scrollPlayheadIntoView(el, playheadX);
        return;
      }
      // Large seeks (inspector jump, restore, agent) — bring needle into view even when paused.
      const jumpMs = Math.abs(state.ui.playheadMs - prev.ui.playheadMs);
      if (jumpMs >= 750) {
        const left = el.scrollLeft;
        const right = left + el.clientWidth;
        if (playheadX < left + 24 || playheadX > right - 24) {
          programmaticScrollGenRef.current += 1;
          scrollPlayheadIntoView(el, playheadX);
          userScrolledAwayRef.current = false;
        }
      }
    });
  }, []);

  const handleTimelinePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setHoverMs(clientXToMs(e.clientX));
    },
    [clientXToMs],
  );

  const handleTimelinePointerLeave = useCallback(() => {
    setHoverMs(null);
  }, []);

  const handleTimelineSeek = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("[data-timeline-clip]")) return;
      if ((e.target as HTMLElement).closest("[data-timeline-playhead]")) return;
      e.preventDefault();
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const startX = e.clientX - rect.left + target.scrollLeft;
      const startY = e.clientY - rect.top + target.scrollTop;
      let mode: "pending" | "seek" | "marquee" = "pending";
      let scrubStarted = false;

      userScrolledAwayRef.current = false;
      setPlaying(false);

      const scrub = getPlayheadScrub();

      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => {
        const x = ev.clientX - rect.left + target.scrollLeft;
        const y = ev.clientY - rect.top + target.scrollTop;
        const dx = x - startX;
        const dy = y - startY;
        if (mode === "pending") {
          if (Math.hypot(dx, dy) < 6) return;
          // Prefer marquee when drag has vertical component or Shift is held (batch mention).
          if (ev.shiftKey || Math.abs(dy) > Math.abs(dx) * 0.55) {
            mode = "marquee";
            setMarquee({ x0: startX, y0: startY, x1: x, y1: y });
            return;
          }
          mode = "seek";
          scrub.start();
          scrubStarted = true;
          scrub.move(clientXToMs(ev.clientX));
          return;
        }
        if (mode === "marquee") {
          setMarquee({ x0: startX, y0: startY, x1: x, y1: y });
          return;
        }
        scrub.move(clientXToMs(ev.clientX));
      };

      const onUp = (ev: PointerEvent) => {
        const x = ev.clientX - rect.left + target.scrollLeft;
        const y = ev.clientY - rect.top + target.scrollTop;

        if (mode === "marquee") {
          const left = Math.min(startX, x);
          const right = Math.max(startX, x);
          const top = Math.min(startY, y);
          const bottom = Math.max(startY, y);
          const ids: string[] = [];
          let yCursor = TIMELINE_RULER_HEIGHT;
          for (const track of visibleTracks) {
            const rowH = trackRowHeight(track.type);
            const rowTop = yCursor;
            const rowBottom = yCursor + rowH;
            yCursor += rowH + TIMELINE_TRACK_GAP;
            if (rowBottom < top || rowTop > bottom) continue;
            for (const item of track.items) {
              if (item.hidden) continue;
              const clipLeft = msToPx(item.startMs, zoom);
              const clipRight = msToPx(item.endMs, zoom);
              if (clipRight < left || clipLeft > right) continue;
              ids.push(item.id);
            }
          }
          setMarquee(null);
          if (ids.length) {
            addAgentMentions(ids);
            selectItem(ids[0] ?? null);
            toggleAgentPanel(true);
          }
        } else if (mode === "seek" && scrubStarted) {
          const ms = clientXToMs(ev.clientX);
          scrub.end(ms);
          useEditorStore.getState().setPreviewScrubMs(null);
          userSeekRef.current = true;
          playheadRef.current?.syncFromStore();
        } else {
          // Click without drag — seek
          const ms = clientXToMs(ev.clientX);
          useEditorStore.getState().setPreviewScrubMs(null);
          userSeekRef.current = true;
          setPlayhead(ms);
        }

        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [
      clientXToMs,
      getPlayheadScrub,
      setPlaying,
      setPlayhead,
      visibleTracks,
      zoom,
      addAgentMentions,
      selectItem,
      toggleAgentPanel,
    ],
  );

  const handlePlayheadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      userScrolledAwayRef.current = false;
      setPlaying(false);
      const scrub = getPlayheadScrub();
      scrub.start();
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const seekAt = (clientX: number) => {
        const ms = clientXToMs(clientX);
        scrub.move(ms);
      };
      seekAt(e.clientX);

      const onMove = (ev: PointerEvent) => {
        seekAt(ev.clientX);
      };
      const onUp = (ev: PointerEvent) => {
        const ms = clientXToMs(ev.clientX);
        scrub.end(ms);
        useEditorStore.getState().setPreviewScrubMs(null);
        userSeekRef.current = true;
        playheadRef.current?.syncFromStore();
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [clientXToMs, getPlayheadScrub, setPlaying],
  );

  /** Select a clip and keep preview linked — seek into the clip if playhead is outside. */
  const selectItemLinked = useCallback(
    (itemId: string) => {
      selectItem(itemId);
      const state = useEditorStore.getState();
      let item: { startMs: number; endMs: number } | null = null;
      for (const track of state.timeline.tracks) {
        const found = track.items.find((i) => i.id === itemId);
        if (found) {
          item = found;
          break;
        }
      }
      if (!item) return;
      const ph = state.ui.playheadMs;
      if (ph < item.startMs || ph >= item.endMs) {
        userSeekRef.current = true;
        setPlayhead(item.startMs);
      }
    },
    [selectItem, setPlayhead],
  );

  const durationSec = durationMs / 1000;
  const exportDurationMs = useMemo(() => {
    if (lastRenderedDurationMs && lastRenderedDurationMs > 0) return lastRenderedDurationMs;
    return estimateExportDurationMs(timeline);
  }, [lastRenderedDurationMs, timeline]);
  const exportDurationIsConfirmed = Boolean(lastRenderedDurationMs && lastRenderedDurationMs > 0);
  const stepSec = computeRulerStepSec(durationSec, zoom);
  const rulerMarks: number[] = [];
  for (let s = 0; s <= durationSec; s += stepSec) rulerMarks.push(s);

  return (
    <section
      className={cn(
        "editor-timeline-shell flex h-full min-h-0 flex-col overflow-hidden",
        agentPanelOpen && "editor-timeline-shell--agent-open",
        agentBusy && "editor-timeline-shell--agent-busy",
      )}
    >
      {/* Transport — single row; compact when agent panel narrows the column */}
      <div
        className="shrink-0 border-b border-white/[0.06] px-2 py-1.5 sm:px-3"
        style={{ minHeight: agentPanelOpen ? 44 : TIMELINE_CONTROLS_HEIGHT }}
      >
        <div
          className={cn(
            // Allow wrapping instead of forcing a single row that overlaps at half-screen.
            // The transport naturally flows to two rows on narrow widths.
            "flex min-h-9 flex-wrap items-center justify-between gap-x-1 gap-y-1 px-0.5",
          )}
        >
          <div className="flex min-w-0 shrink items-center gap-0.5">
            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg hover:bg-white/[0.08] disabled:opacity-30 sm:size-8"
              onClick={() => undo()}
              title="Undo (Ctrl/⌘+Z)"
              disabled={!canUndo}
            >
              <Undo2 className="size-[15px]" />
            </IconButton>
            <IconButton
              size="sm"
              className={cn(
                "size-7 shrink-0 rounded-lg hover:bg-white/[0.08] disabled:opacity-30 sm:size-8",
                agentPanelOpen ? "hidden" : "hidden sm:inline-flex",
              )}
              onClick={() => redo()}
              title="Redo (Ctrl/⌘+Y)"
              disabled={!canRedo}
            >
              <Redo2 className="size-[15px]" />
            </IconButton>
            <IconButton
              size="sm"
              className={cn(
                "size-7 shrink-0 rounded-lg hover:bg-white/[0.08] sm:size-8",
                agentPanelOpen && "hidden lg:inline-flex",
              )}
              onClick={() => {
                setPlaying(false);
                setPlayhead(0);
                userSeekRef.current = true;
              }}
              title="Back to start"
            >
              <RotateCcw className="size-[15px]" />
            </IconButton>

            {!agentPanelOpen ? <TransportDivider /> : null}

            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.24)] transition-colors",
                agentPanelOpen ? "size-8" : "size-9",
                isPlaying
                  ? "bg-white text-black hover:bg-zinc-200"
                  : "bg-[#3B82F6] text-white hover:bg-[#2563EB]",
              )}
              onClick={() => {
                userScrolledAwayRef.current = false;
                setPlaying(!isPlaying);
              }}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="size-3.5 fill-current sm:size-4" />
              ) : (
                <Play className="size-3.5 fill-current pl-0.5 sm:size-4" />
              )}
            </button>

            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg hover:bg-white/[0.08] disabled:opacity-30 sm:size-8"
              disabled={!selectedItemId}
              title="Split at playhead (S)"
              onClick={() => {
                if (!selectedItemId) return;
                const rightId = splitItem(selectedItemId, playheadMs);
                if (rightId) selectItem(rightId);
              }}
            >
              <Scissors className="size-[15px]" />
            </IconButton>

            <TransportPlayheadTime
              durationMs={durationMs}
              exportDurationMs={exportDurationMs}
              exportDurationIsConfirmed={exportDurationIsConfirmed}
            />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="ml-0.5 inline-flex shrink-0 rounded-lg border border-white/[0.1] bg-black/20 px-1.5 py-1 text-[10px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white sm:ml-1 sm:px-2"
                    title="Playback speed"
                  />
                }
              >
                {formatSpeed(playbackSpeed)}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[220] w-40">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Speed (preview)</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <DropdownMenuItem
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className="justify-between"
                    >
                      {formatSpeed(speed)}
                      {playbackSpeed === speed ? <Check className="size-3.5" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-[9px] text-zinc-500">Export is always 1×</p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className={cn(
              "flex min-w-0 items-center justify-end gap-1",
              agentPanelOpen ? "max-w-[140px] flex-1" : "flex-1 basis-[120px] sm:max-w-[360px] sm:basis-auto sm:justify-center",
            )}
          >
            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg border border-white/[0.07] bg-black/20 hover:bg-white/[0.08]"
              onClick={() => applyZoomCentered(zoom - 2)}
              title="Zoom out"
            >
              <Minus className="size-3.5" />
            </IconButton>
            <Slider
              className={cn(
                "w-full [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-[#2a2a2a] [&_[data-slot=slider-range]]:bg-[#2563EB] [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-[#2563EB] [&_[data-slot=slider-thumb]]:bg-[#2563EB]",
                agentPanelOpen ? "min-w-[36px] max-w-[64px]" : "min-w-[48px] max-w-[96px]",
              )}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={1}
              value={[zoom]}
              onValueChange={(v) => applyZoomCentered(sliderValue(v))}
            />
            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg border border-white/[0.07] bg-black/20 hover:bg-white/[0.08]"
              onClick={() => applyZoomCentered(zoom + 2)}
              title="Zoom in"
            >
              <Plus className="size-3.5" />
            </IconButton>

            <div
              className={cn(
                "ml-1 items-center gap-0.5 rounded-lg border border-white/[0.07] bg-black/20 p-0.5",
                agentPanelOpen ? "hidden" : "hidden sm:flex",
              )}
            >
              {(
                [
                  { label: "Fit", action: fitOverview },
                  { label: "30s", action: () => zoomWindow(30_000) },
                  { label: "1m", action: () => zoomWindow(60_000) },
                  { label: "Edit", action: fitEditWindow },
                ] as const
              ).map(({ label, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-zinc-500 transition-colors hover:bg-white/[0.1] hover:text-zinc-100"
                  title={
                    label === "Fit"
                      ? "Overview — whole project"
                      : label === "Edit"
                        ? "Edit window around playhead"
                        : `Show ~${label} around playhead`
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 pl-1",
              !agentPanelOpen && "border-l border-white/[0.08] pl-1.5",
            )}
          >
            <IconButton
              size="sm"
              className={cn(
                "size-8 rounded-lg hover:bg-white/[0.08]",
                agentPanelOpen ? "hidden" : "hidden sm:inline-flex",
                showAllTracks && "bg-white/[0.08] text-sky-300",
              )}
              onClick={() => setShowAllTracks((v) => !v)}
              title={
                showAllTracks
                  ? "Hide empty tracks"
                  : hiddenOptionalCount > 0
                    ? `Show empty tracks (${hiddenOptionalCount})`
                    : "All tracks visible"
              }
            >
              <Layers className="size-[15px]" />
            </IconButton>

            {validationIssues.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <IconButton
                      size="sm"
                      className="size-8 rounded-lg text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                      title={`${validationIssues.length} issue${validationIssues.length === 1 ? "" : "s"}`}
                    />
                  }
                >
                  <TriangleAlert className="size-[15px]" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[220] w-72">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      {validationIssues.length} issue
                      {validationIssues.length === 1 ? "" : "s"}
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {validationIssues.slice(0, 8).map((issue, idx) => (
                      <DropdownMenuItem
                        key={`${issue.code}-${issue.itemId ?? idx}`}
                        className="items-start whitespace-normal text-[11px] leading-snug"
                        onClick={() => {
                          if (issue.itemId) {
                            selectItem(issue.itemId);
                            setPlayhead(
                              tracks
                                .flatMap((t) => t.items)
                                .find((i) => i.id === issue.itemId)?.startMs ?? 0,
                            );
                          }
                        }}
                      >
                        {issue.message}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    size="sm"
                    className={cn(
                      "size-8 rounded-lg hover:bg-white/[0.08]",
                      agentPanelOpen ? "hidden" : "hidden md:inline-flex",
                    )}
                    title="Keyboard shortcuts"
                  />
                }
              >
                <Keyboard className="size-[15px]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[220] w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="justify-between text-xs" disabled>
                    Play / Pause <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Space</kbd>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="justify-between text-xs" disabled>
                    Split clip <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">S</kbd>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="justify-between text-xs" disabled>
                    Undo <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl/⌘ Z</kbd>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="justify-between text-xs" disabled>
                    Zoom <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Ctrl + scroll</kbd>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="justify-between text-xs" disabled>
                    Nudge <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">← →</kbd>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <IconButton
              size="sm"
              className={cn(
                "size-7 rounded-lg hover:bg-white/[0.08] sm:size-8",
                settings.previewMuted && "text-zinc-500",
              )}
              title={settings.previewMuted ? "Unmute preview" : "Mute preview"}
              onClick={() => updateSettings({ previewMuted: !Boolean(settings.previewMuted) })}
            >
              {settings.previewMuted ? (
                <VolumeX className="size-[15px]" />
              ) : (
                <Volume2 className="size-[15px]" />
              )}
            </IconButton>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    size="sm"
                    className="size-7 rounded-lg hover:bg-white/[0.08] sm:size-8"
                    title="Mix levels"
                  />
                }
              >
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[220] w-64 p-3">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Preview sound</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <div className="space-y-3 px-1 py-1" onPointerDown={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({ previewMuted: !Boolean(settings.previewMuted) })
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors",
                      settings.previewMuted
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      {settings.previewMuted ? (
                        <VolumeX className="size-3.5" />
                      ) : (
                        <Volume2 className="size-3.5" />
                      )}
                      {settings.previewMuted ? "Muted" : "Sound on"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {settings.previewMuted ? "Click to unmute" : "Click to mute"}
                    </span>
                  </button>
                  {(
                    [
                      { key: "narrationVolume" as const, label: "Narration" },
                      { key: "musicVolume" as const, label: "Music" },
                      { key: "sfxVolume" as const, label: "SFX + whooshes" },
                      { key: "clipAudioVolume" as const, label: "Clip audio (preview only)" },
                    ] as const
                  ).map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <span>{label}</span>
                        <span className="tabular-nums text-zinc-300">{settings[key]}%</span>
                      </div>
                      <Slider
                        value={[settings[key]]}
                        max={100}
                        step={1}
                        disabled={Boolean(settings.previewMuted)}
                        onValueChange={(v) => updateSettings({ [key]: sliderValue(v) })}
                      />
                    </div>
                  ))}
                  <p className="text-[9px] leading-snug text-zinc-600">
                    Mute silences preview only. Export mix uses the sliders above (not mute).
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <IconButton
              size="sm"
              className="size-7 rounded-lg hover:bg-white/[0.08] sm:size-8"
              onClick={() => setRightPanelOpen(true)}
              title="Timeline settings"
            >
              <Settings2 className="size-[15px]" />
            </IconButton>
            <IconButton
              size="sm"
              className={cn(
                "size-7 rounded-lg hover:bg-white/[0.08] sm:size-8",
                agentPanelOpen && "hidden",
              )}
              title="Download video"
              onClick={async () => {
                if (!projectId) return;
                try {
                  const artifact = await downloadVideo(projectId);
                  window.open(artifact.downloadUrl, "_blank", "noopener,noreferrer");
                } catch {
                  toast.error("Video not ready");
                }
              }}
            >
              <Download className="size-[15px]" />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="editor-scroll flex min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {/* Track labels */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-white/[0.06] bg-[#0e0e10]"
            style={{ width: TIMELINE_LABEL_WIDTH }}
          >
            <div
              className="flex items-end justify-between border-b border-white/[0.05] px-2.5 pb-1.5"
              style={{ height: TIMELINE_RULER_HEIGHT }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                Timeline
              </span>
              {hiddenOptionalCount > 0 ? (
                <button
                  type="button"
                  className="text-[9px] text-zinc-600 hover:text-zinc-400"
                  onClick={() => setShowAllTracks((v) => !v)}
                  title="Toggle empty tracks"
                >
                  {showAllTracks ? (
                    <EyeOff className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  )}
                </button>
              ) : null}
            </div>
            {visibleTracks.map((track, index) => {
              const h = trackRowHeight(track.type);
              const meta = TRACK_META[track.type];
              const Icon = TRACK_ICONS[track.type];
              const isHidden = Boolean(track.hidden);
              const isLocked = Boolean(track.locked);
              return (
                <div
                  key={track.id}
                  className={cn(
                    "group relative flex items-center gap-1 px-1.5",
                    isHidden && "opacity-45",
                  )}
                  style={{
                    height: h,
                    marginBottom: TIMELINE_TRACK_GAP,
                    background: index % 2 === 0 ? "rgba(255,255,255,0.018)" : "transparent",
                  }}
                  title={`${track.label} · ${track.items.length} clips`}
                >
                  <span
                    className="absolute inset-y-1.5 left-0 w-[2px] rounded-full opacity-90"
                    style={{ backgroundColor: meta.accent }}
                    aria-hidden
                  />
                  <div className="flex shrink-0 flex-col gap-0">
                    <button
                      type="button"
                      className="inline-flex size-3.5 items-center justify-center rounded text-zinc-600 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-25"
                      title="Move track up"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveTrack(track.id, -1);
                      }}
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-3.5 items-center justify-center rounded text-zinc-600 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-25"
                      title="Move track down"
                      disabled={index >= visibleTracks.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveTrack(track.id, 1);
                      }}
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                  <span
                    className="inline-flex size-5 shrink-0 cursor-grab items-center justify-center text-zinc-600 active:cursor-grabbing"
                    title="Drag to reorder track"
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const startY = e.clientY;
                      const startIndex = index;
                      const trackId = track.id;
                      let lastSwap = startIndex;
                      const onMove = (ev: PointerEvent) => {
                        const rowH = trackRowHeight(track.type) + TIMELINE_TRACK_GAP;
                        const deltaRows = Math.round((ev.clientY - startY) / rowH);
                        const nextIndex = Math.max(
                          0,
                          Math.min(visibleTracks.length - 1, startIndex + deltaRows),
                        );
                        if (nextIndex === lastSwap) return;
                        lastSwap = nextIndex;
                        const ids = visibleTracks.map((t) => t.id);
                        const from = ids.indexOf(trackId);
                        if (from < 0) return;
                        ids.splice(from, 1);
                        ids.splice(nextIndex, 0, trackId);
                        reorderTracksByIds(ids);
                      };
                      const onUp = () => {
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                        window.removeEventListener("pointercancel", onUp);
                      };
                      window.addEventListener("pointermove", onMove);
                      window.addEventListener("pointerup", onUp);
                      window.addEventListener("pointercancel", onUp);
                    }}
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                  <span
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ring-white/[0.06]"
                    style={{ backgroundColor: meta.accentSoft, color: meta.accent }}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium tracking-tight text-zinc-300">
                      {meta.short}
                    </span>
                    <span className="block truncate text-[9px] tabular-nums text-zinc-600">
                      {track.items.length}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md text-zinc-500 hover:bg-white/10 hover:text-zinc-200",
                        isLocked && "opacity-100 text-amber-400/90",
                      )}
                      title={isLocked ? "Unlock track" : "Lock track"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackLocked(track.id);
                      }}
                    >
                      {isLocked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md text-zinc-500 hover:bg-white/10 hover:text-zinc-200",
                        isHidden && "opacity-100 text-zinc-400",
                      )}
                      title={isHidden ? "Show track" : "Hide track"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackHidden(track.id);
                      }}
                    >
                      {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded-md text-zinc-500 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30"
                      title="Clear all clips on track"
                      disabled={track.items.length === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (track.items.length === 0) return;
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(`Clear all clips on ${meta.short}?`)
                        ) {
                          return;
                        }
                        clearTrackItems(track.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrollable lanes */}
          <div
            ref={scrollRef}
            data-timeline-scroll-root
            className="editor-scroll relative min-w-0 flex-1 cursor-crosshair touch-none overflow-x-auto overflow-y-visible"
            onPointerMove={handleTimelinePointerMove}
            onPointerLeave={handleTimelinePointerLeave}
            onPointerDown={handleTimelineSeek}
          >
            <div
              className="relative min-w-full"
              style={{
                width: timelineWidth,
                minHeight: TIMELINE_RULER_HEIGHT + tracksAreaHeight,
              }}
            >
              {agentBusy ? (
                <div
                  className="editor-timeline-skeleton-sweep"
                  style={{ top: TIMELINE_RULER_HEIGHT, height: tracksAreaHeight }}
                  aria-hidden
                />
              ) : null}
              {marquee ? (
                <div
                  className="pointer-events-none absolute z-[40] rounded-md border border-[#3B82F6]/80 bg-[#2563EB]/15"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                  }}
                />
              ) : null}
              {/* Ruler */}
              <div
                className="relative border-b border-white/[0.06] bg-[#121212]"
                style={{ height: TIMELINE_RULER_HEIGHT }}
              >
                {rulerMarks.map((s) => (
                  <div
                    key={s}
                    className="absolute bottom-0 flex flex-col items-start"
                    style={{ left: msToPx(s * 1000, zoom) }}
                  >
                    <span className="pl-0.5 text-[9px] tabular-nums text-zinc-500">
                      {s >= 60
                        ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}`
                        : `${s}s`}
                    </span>
                    <div className="h-1.5 w-px bg-zinc-600" />
                  </div>
                ))}
              </div>

              {visibleTracks.map((track, index) => {
                const rowH = trackRowHeight(track.type);
                const meta = TRACK_META[track.type];
                const isCaptions = track.type === "captions";
                const isVideo = track.type === "video";
                return (
                  <div
                    key={track.id}
                    className="relative"
                    style={{
                      height: rowH,
                      marginBottom: TIMELINE_TRACK_GAP,
                      background:
                        index % 2 === 0
                          ? `linear-gradient(90deg, ${meta.accentSoft}, transparent 22%), rgba(255,255,255,0.012)`
                          : `linear-gradient(90deg, ${meta.accentSoft}, transparent 14%)`,
                      boxShadow:
                        isCaptions || isVideo
                          ? `inset 0 -1px 0 ${meta.accent}22`
                          : undefined,
                    }}
                  >
                    {(() => {
                      const visibleCaptionCount =
                        isCaptions
                          ? track.items.filter((i) => i.type === "captions" && !i.hidden).length
                          : track.items.length;
                      const emptyLane = visibleCaptionCount === 0;
                      return emptyLane ? (
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
                          setRightPanelOpen(true);
                          toast.message(`Add ${meta.short}`, {
                            description: "Use Media, Text, or Audio tools — or drop a file on this lane.",
                          });
                        }}
                      >
                        <Plus className="size-4" style={{ color: meta.accent }} strokeWidth={2.25} />
                      </button>
                      ) : null;
                    })()}
                    {isCaptions
                      ? (() => {
                          const group = combineCaptionsForTimeline(track.items, durationMs);
                          if (!group) return null;
                          return (
                            <CaptionGroupBlock
                              key={group.id}
                              group={group}
                              zoom={zoom}
                              trackHeight={rowH}
                              selected={group.items.some((i) => i.id === selectedItemId)}
                              onSelectMember={(itemId) => selectItemLinked(itemId)}
                            />
                          );
                        })()
                      : track.items.map((item) => {
                          const inView =
                            item.endMs >= viewRangeMs.startMs && item.startMs <= viewRangeMs.endMs;
                          if (!inView) {
                            // Keep layout width via an empty absolute spacer using clip geometry.
                            const left = msToPx(item.startMs, zoom);
                            const width = Math.max(2, msToPx(item.endMs - item.startMs, zoom));
                            return (
                              <div
                                key={item.id}
                                data-timeline-clip
                                aria-hidden
                                className="pointer-events-none absolute top-0 h-full opacity-0"
                                style={{ left, width }}
                              />
                            );
                          }
                          const transition = showTransitions
                            ? transitions.find((t) => t.afterItemId === item.id && t.enabled)
                            : null;
                          const isVideoTrack = track.type === "video";
                          const sortedVideo = isVideoTrack
                            ? [...track.items].sort((a, b) => a.startMs - b.startMs)
                            : [];
                          const videoIdx = sortedVideo.findIndex((i) => i.id === item.id);
                          const nextClip =
                            isVideoTrack && videoIdx >= 0 ? sortedVideo[videoIdx + 1] : undefined;
                          const hasNext =
                            Boolean(nextClip) &&
                            clipsAbut(item.endMs, nextClip!.startMs);
                          return (
                            <div key={item.id} data-timeline-clip>
                              <TimelineClipBlock
                                item={item}
                                zoom={zoom}
                                trackHeight={rowH}
                                selected={selectedItemId === item.id}
                                transition={transition}
                                showBoundary={Boolean(showTransitions && hasNext)}
                                transitionSelected={Boolean(
                                  transition && selectedTransitionId === transition.id,
                                )}
                                onSelect={() => {
                                  selectItemLinked(item.id);
                                }}
                                onSeekToStart={() => {
                                  userSeekRef.current = true;
                                  setPlayhead(item.startMs);
                                }}
                                onOpenInspector={() => {
                                  setRightPanelOpen(true);
                                }}
                                onSelectTransition={() => {
                                  if (!hasNext) return;
                                  if (transition) {
                                    selectTransition(transition.id);
                                    return;
                                  }
                                  const id = addTransition(item.id, "fade", 500);
                                  if (id) selectTransition(id);
                                }}
                              />
                            </div>
                          );
                        })}
                  </div>
                );
              })}

              <TimelineHoverGuide hoverMs={hoverMs} tracksAreaHeight={tracksAreaHeight} />

              <TimelinePlayhead
                ref={playheadRef}
                tracksAreaHeight={tracksAreaHeight}
                onPointerDown={handlePlayheadPointerDown}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
