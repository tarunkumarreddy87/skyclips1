"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Captions,
  Check,
  Eye,
  EyeOff,
  Film,
  ImageIcon,
  Keyboard,
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
  StepBack,
  StepForward,
  Maximize2,
  Magnet,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  TriangleAlert,
} from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
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
  layoutTrack,
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
import { TimelinePlayhead, type TimelinePlayheadHandle } from "./timeline-playhead";
import {
  TimelineTrackLane,
  type TimelineTrackLaneHandlers,
} from "./timeline-track-lane";
import { IconButton } from "./icon-button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createPlayheadScrubController } from "@/lib/editor/playhead-scrub";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

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
          ? "Confirmed length from last native render"
          : "Playback position / timeline duration. Preview and export use the same clock."
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
  // Subscribe to playhead only while hovering — selector returns null when idle so
  // playhead ticks do not re-render this leaf during playback.
  const playheadMs = useEditorStore((s) =>
    hoverMs == null ? null : s.ui.playheadMs,
  );
  const zoom = useEditorStore((s) => s.timeline.settings.zoom);
  if (hoverMs == null || playheadMs == null || Math.abs(hoverMs - playheadMs) <= 40) {
    return null;
  }
  const hoverX = msToPx(hoverMs, zoom);
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 w-px bg-white/40"
      style={{ left: hoverX, height: TIMELINE_RULER_HEIGHT + tracksAreaHeight }}
    >
      <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white/60" />
      <div className="absolute left-1.5 top-0.5 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] tabular-nums text-zinc-200">
        Hover {formatTimecode(hoverMs)}
      </div>
    </div>
  );
}

/** Play/pause isolated so isPlaying toggles do not re-render the full shell. */
function TransportPlayButton({
  compact,
  onBeforeToggle,
}: {
  compact: boolean;
  onBeforeToggle?: () => void;
}) {
  const isPlaying = useEditorStore((s) => s.ui.isPlaying);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  return (
    <button
      type="button"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.24)] transition-colors",
        compact ? "size-8" : "size-9",
        "bg-[#3B82F6] text-white hover:bg-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300",
      )}
      onClick={() => {
        onBeforeToggle?.();
        setPlaying(!useEditorStore.getState().ui.isPlaying);
      }}
      title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      data-timeline-play-button
    >
      {isPlaying ? (
        <Pause className="size-3.5 sm:size-4" />
      ) : (
        <Play className="size-3.5 fill-current pl-0.5 sm:size-4" />
      )}
    </button>
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
  // playheadMs / isPlaying intentionally NOT selected here — leaves + subscribe only.
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

  // Keep every timeline layer on the same finite canvas. Rounding avoids sub-pixel drift between the ruler, clips, and playhead at long durations.
  const timelineWidth = Math.max(Math.ceil(msToPx(Math.max(0, durationMs), zoom)), 1);

  const visibleTracks = useMemo(
    () => resolveVisibleTracks(tracks, false, trackOrder),
    [tracks, trackOrder],
  );

  const tracksAreaHeight = visibleTracks.reduce(
    (sum, t) => sum + layoutTrack(t).height + TIMELINE_TRACK_GAP,
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
          // Drive native engine at pointer rate (store playhead stays throttled).
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
  }, [setZoom, zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fittedRef.current) return;
    fitEditWindow();
  }, [fitEditWindow]);

  // Reset follow-scroll lock when playback starts (no shell re-render on isPlaying).
  useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      if (state.ui.isPlaying && !prev.ui.isPlaying) {
        userScrolledAwayRef.current = false;
      }
    });
  }, []);

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
            const layout = layoutTrack(track);
            const rowH = layout.height;
            const rowTop = yCursor;
            const rowBottom = yCursor + rowH;
            yCursor += rowH + TIMELINE_TRACK_GAP;
            if (rowBottom < top || rowTop > bottom) continue;
            for (const item of track.items) {
              if (item.hidden) continue;
              const itemTop = rowTop + (layout.offsets.get(item.id) ?? 0);
              if (itemTop > bottom || itemTop + trackRowHeight(track.type) < top) continue;
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

  const laneHandlers = useMemo<TimelineTrackLaneHandlers>(
    () => ({
      onSelectItem: (itemId) => selectItemLinked(itemId),
      onOpenInspector: () => setRightPanelOpen(true),
      onSelectOrAddTransition: (afterItemId, hasNext) => {
        if (!hasNext) return;
        const state = useEditorStore.getState();
        const existing = state.timeline.transitions.find(
          (t) => t.afterItemId === afterItemId && t.enabled,
        );
        if (existing) {
          selectTransition(existing.id);
          return;
        }
        const id = addTransition(afterItemId, "fade", 500);
        if (id) selectTransition(id);
      },
      onEmptyLaneAdd: () => setRightPanelOpen(true),
    }),
    [selectItemLinked, setRightPanelOpen, selectTransition, addTransition],
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
        "editor-timeline-shell editor-timeline-light flex h-full min-h-0 flex-col overflow-hidden",
      )}
    >
      {/* Transport — single row; compact when agent panel narrows the column */}
      <div
        className="editor-timeline-chrome shrink-0 border-b border-zinc-200 bg-white px-2 py-1.5 sm:px-3"
        style={{ minHeight: TIMELINE_CONTROLS_HEIGHT }}
      >
        <div
          className="flex min-h-11 flex-nowrap items-center gap-1 overflow-hidden px-0.5 sm:gap-2"
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
                "inline-flex",
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

          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
            <IconButton title="Previous frame" size="sm" onClick={() => { setPlaying(false); setPlayhead(useEditorStore.getState().ui.playheadMs - 1000 / timeline.fps); userSeekRef.current = true; }}><StepBack className="size-4" /></IconButton>
            <TransportPlayButton
              compact={agentPanelOpen}
              onBeforeToggle={() => {
                userScrolledAwayRef.current = false;
              }}
            />
            <IconButton title="Next frame" size="sm" onClick={() => { setPlaying(false); setPlayhead(useEditorStore.getState().ui.playheadMs + 1000 / timeline.fps); userSeekRef.current = true; }}><StepForward className="size-4" /></IconButton>
            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg hover:bg-white/[0.08] disabled:opacity-30 sm:size-8"
              disabled={!selectedItemId}
              title="Split at playhead (S)"
              onClick={() => {
                if (!selectedItemId) return;
                const ph = useEditorStore.getState().ui.playheadMs;
                const rightId = splitItem(selectedItemId, ph);
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
              "flex shrink-0 flex-nowrap items-center justify-end gap-1",
            )}
          >
            <span
              className={cn(
                "hidden text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500",
                !agentPanelOpen && "lg:inline",
              )}
            >
              Timeline Scale
            </span>
            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg border border-white/[0.07] bg-black/20 hover:bg-white/[0.08]"
              onClick={() => applyZoomCentered(zoom / 1.3)}
              title="Zoom out"
            >
              <Minus className="size-3.5" />
            </IconButton>
            <Slider
              className={cn(
                "w-20 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-thumb]]:size-3",
                !agentPanelOpen && "hidden xl:block",
                agentPanelOpen && "hidden",
              )}
              aria-label="Timeline zoom"
              min={Math.log(MIN_ZOOM)}
              max={Math.log(MAX_ZOOM)}
              step={0.01}
              value={[Math.log(zoom)]}
              onValueChange={(v) => applyZoomCentered(Math.exp(sliderValue(v)))}
            />
            <IconButton
              size="sm"
              className="size-7 shrink-0 rounded-lg border border-white/[0.07] bg-black/20 hover:bg-white/[0.08]"
              onClick={() => applyZoomCentered(zoom * 1.3)}
              title="Zoom in"
            >
              <Plus className="size-3.5" />
            </IconButton>

            <div
              className={cn(
                "ml-1 items-center gap-0.5 rounded-lg border border-white/[0.07] bg-black/20 p-0.5",
                "flex",
              )}
            >
              {(
                [
                  { label: "Fit View", action: fitOverview },
                ] as const
              ).map(({ label, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-zinc-500 transition-colors hover:bg-white/[0.1] hover:text-zinc-100"
                  title={
                    label === "Fit View"
                      ? "Overview — whole project"
                      : label === "Edit"
                        ? "Edit window around playhead"
                        : `Show ~${label} around playhead`
                  }
                >
                  <Maximize2 className="size-3.5" aria-label={label} />
                </button>
              ))}
              <IconButton title="Timeline snapping" aria-pressed={settings.snappingEnabled} size="sm" onClick={() => updateSettings({ snappingEnabled: !settings.snappingEnabled })}><Magnet className={cn("size-3.5", settings.snappingEnabled && "text-sky-400")} /></IconButton>
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-nowrap items-center gap-0.5 pl-1",
              !agentPanelOpen && "border-l border-white/[0.08] pl-1.5",
            )}
          >
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
                      "size-8 rounded-lg hover:bg-white/[0.08] inline-flex",
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
                "size-7 rounded-lg hover:bg-white/[0.08] sm:size-8 inline-flex",
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
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="editor-scroll flex min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {/* Compact track rail; labels and per-track menus stay out of the timeline surface. */}
          <div
            data-track-rail
            className="editor-timeline-chrome sticky left-0 z-10 shrink-0 overflow-hidden border-r border-transparent bg-transparent"
            style={{ width: TIMELINE_LABEL_WIDTH }}
          >
            <div className="border-b border-white/[0.05]" style={{ height: TIMELINE_RULER_HEIGHT }} />
            {visibleTracks.map((track, index) => {
              const h = layoutTrack(track).height;
              const meta = TRACK_META[track.type];
              const isHidden = Boolean(track.hidden);
              const isLocked = Boolean(track.locked);
              return (
                <div
                  key={track.id}
                  data-track-rail-row
                  className={cn(
                    "group relative flex cursor-grab items-center justify-center px-0 active:cursor-grabbing",
                    isHidden && "opacity-45",
                  )}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/timeline-track", track.id);
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("text/timeline-track")) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromId = event.dataTransfer.getData("text/timeline-track");
                    if (!fromId || fromId === track.id) return;
                    const fromIndex = visibleTracks.findIndex((candidate) => candidate.id === fromId);
                    const toIndex = visibleTracks.findIndex((candidate) => candidate.id === track.id);
                    if (fromIndex >= 0 && toIndex >= 0) moveTrack(fromId, toIndex > fromIndex ? 1 : -1);
                  }}
                  style={{
                    height: h,
                    marginBottom: TIMELINE_TRACK_GAP,
                    background: index % 2 === 0 ? "rgba(255,255,255,0.018)" : "transparent",
                  }}
                  title={`${track.label} · ${track.items.length} clips`}
                >
                  <span data-track-rail-grip className="pointer-events-none relative z-10" aria-hidden>
                    {Array.from({ length: 6 }, (_, dot) => <span key={dot} />)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${meta.short}`}
                      title={`${meta.short} track actions`}
                      className="absolute inset-1 inline-flex items-center justify-center rounded-md border border-transparent text-transparent transition-colors hover:border-white/10 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => event.preventDefault()}
                    >
                      <span className="sr-only">Open {meta.short} track actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" sideOffset={6} className="w-48 rounded-xl p-1.5 shadow-xl">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>{meta.short}</DropdownMenuLabel>
                        <DropdownMenuItem disabled={index === 0} onClick={() => moveTrack(track.id, -1)}>
                          <ChevronUp />Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={index >= visibleTracks.length - 1} onClick={() => moveTrack(track.id, 1)}>
                          <ChevronDown />Move down
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleTrackLocked(track.id)}>
                          <Lock />{isLocked ? "Unlock track" : "Lock track"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleTrackHidden(track.id)}>
                          <Eye />{isHidden ? "Show track" : "Hide track"}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" disabled={isLocked || track.items.length === 0}
                          onClick={() => {
                            if (window.confirm(`Clear all clips on ${meta.short}?`)) clearTrackItems(track.id);
                          }}>
                          <Trash2 />Clear track
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>

          {/* Scrollable lanes */}
          <div
            ref={scrollRef}
            data-timeline-scroll-root
            className="editor-scroll relative min-w-0 flex-1 self-start cursor-crosshair touch-none overflow-x-auto overflow-y-hidden"
            style={{ height: TIMELINE_RULER_HEIGHT + tracksAreaHeight + 16 }}
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
                data-timeline-ruler
                className="relative z-10 overflow-visible border-b border-white/[0.08] bg-[#17191d]"
                style={{ height: TIMELINE_RULER_HEIGHT }}
              >
                {rulerMarks.map((s) => (
                  <div
                    key={s}
                    className="absolute bottom-0 flex flex-col items-start"
                    style={{ left: msToPx(s * 1000, zoom) }}
                  >
                    <span className="whitespace-nowrap pl-0.5 text-[9px] font-medium tabular-nums text-zinc-400">
                      {s >= 60
                        ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}`
                        : `${s}s`}
                    </span>
                    <div className="h-1.5 w-px bg-zinc-500" />
                  </div>
                ))}
              </div>

              {visibleTracks.map((track, index) => (
                <TimelineTrackLane
                  key={track.id}
                  track={track}
                  index={index}
                  zoom={zoom}
                  durationMs={durationMs}
                  viewRangeMs={viewRangeMs}
                  selectedItemId={selectedItemId}
                  selectedTransitionId={selectedTransitionId}
                  showTransitions={Boolean(showTransitions)}
                  transitions={transitions}
                  handlers={laneHandlers}
                />
              ))}

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
