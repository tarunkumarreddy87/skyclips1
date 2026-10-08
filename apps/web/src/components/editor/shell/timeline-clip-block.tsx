"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  ImageIcon,
  Play,
  Sparkles,
  Type,
  Shuffle,
  Volume2,
} from "lucide-react";
import type { TimelineItem, TransitionItem } from "@/lib/editor/types";
import { useEditorStore, endGestureHistory } from "@/lib/editor/store";
import { collectSnapPoints, snapDuration, snapThresholdMs, snapTime } from "@/lib/editor/snap";
import {
  findOverlappingClipIds,
  proposedRangeForMove,
} from "@/lib/editor/clip-collision";
import { msToPx, pxToMs } from "@/lib/editor/utils";
import { resolveMediaUrl, resolveMediaUrlOrFallback } from "@/lib/editor/media-url";
import { prefetchMediaImage } from "@/lib/http/media-request-cache";
import { cn } from "@/lib/utils";

export type ClipVisualVariant =
  | "video"
  | "image"
  | "text"
  | "caption"
  | "generated"
  | "narration"
  | "music"
  | "sfx";

export function getClipVariant(item: TimelineItem, assetSourceType?: string): ClipVisualVariant {
  if (item.type === "narration") return "narration";
  if (item.type === "music") return "music";
  if (item.type === "sfx") return "sfx";
  if (item.type === "captions") return "caption";
  if (item.type === "text") return "text";
  if (item.type === "animation") return "generated";
  if (item.type === "broll") return "image";
  if (item.type === "video" && "mediaType" in item) {
    if (item.mediaType === "image") return "image";
    if (assetSourceType === "generated") return "generated";
    return "video";
  }
  return "video";
}

/** Borderless rounded clips — selection draws the frame; no start/end edge lines. */
const VARIANT_STYLES: Record<ClipVisualVariant, string> = {
  video: "border-transparent bg-[#1a1a1e] text-zinc-100",
  image: "border-transparent bg-[#1f1f24] text-zinc-100",
  caption: "border-transparent bg-[#2a2f38] text-zinc-100",
  text: "border-transparent bg-[#3B82F6] text-white",
  generated: "border-transparent bg-[#8B5CF6] text-white",
  narration: "border-transparent bg-[#F59E0B] text-white",
  music: "border-transparent bg-[#E8C36A] text-[#1a1208]",
  sfx: "border-transparent bg-[#EA580C] text-white",
};

/** Lighter end-cap fill when selected (mockup trim handles). */
const VARIANT_CAP: Record<ClipVisualVariant, string> = {
  video: "bg-zinc-300",
  image: "bg-zinc-300",
  caption: "bg-zinc-400",
  text: "bg-sky-200",
  generated: "bg-violet-200",
  narration: "bg-amber-100",
  music: "bg-orange-100",
  sfx: "bg-orange-100",
};

const MIN_CLIP_MS = 250;
const TRIM_HANDLE_PX = 10;

function TrimCapGrip({ side, tone }: { side: "left" | "right"; tone: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-y-0 z-[26] flex w-[11px] items-center justify-center",
        side === "left" ? "left-0 rounded-l-[10px]" : "right-0 rounded-r-[10px]",
        tone,
      )}
      aria-hidden
    >
      <span className="flex gap-[2px]">
        <span className="h-3 w-[1.5px] rounded-full bg-black/45" />
        <span className="h-3 w-[1.5px] rounded-full bg-black/45" />
      </span>
    </span>
  );
}

interface WaveformData {
  peaks: number[];
  durationMs: number;
}

const waveformCache = new Map<string, WaveformData>();
const waveformPending = new Map<string, Promise<WaveformData | null>>();

async function loadWaveformData(src: string): Promise<WaveformData | null> {
  const cached = waveformCache.get(src);
  if (cached) return cached;

  const pending = waveformPending.get(src);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const resp = await fetch(src, { mode: "cors" });
      if (!resp.ok) return null;
      const buffer = await resp.arrayBuffer();
      let audio: AudioBuffer;

      // Prefer OfflineAudioContext to decode audio without holding system audio channels
      if (typeof OfflineAudioContext !== "undefined") {
        try {
          const offlineCtx = new OfflineAudioContext(1, 1, 44100);
          audio = await offlineCtx.decodeAudioData(buffer.slice(0));
        } catch {
          audio = await decodeWithAudioContext(buffer);
        }
      } else if (typeof window !== "undefined") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        audio = await decodeWithAudioContext(buffer);
      } else {
        return null;
      }

      // Fast strided peak downsampling (up to 2048 peaks max)
      const PEAKS_COUNT = 2048;
      const peaks = new Float32Array(PEAKS_COUNT);
      const totalChannels = audio.numberOfChannels;

      for (let c = 0; c < totalChannels; c++) {
        const samples = audio.getChannelData(c);
        const len = samples.length;
        const bucketSize = Math.max(1, Math.ceil(len / PEAKS_COUNT));
        const sampleStep = Math.max(1, Math.floor(bucketSize / 32));

        for (let b = 0; b < PEAKS_COUNT; b++) {
          const start = Math.floor(b * len / PEAKS_COUNT);
          const end = Math.min(Math.max(start + 1, Math.floor((b + 1) * len / PEAKS_COUNT)), len);
          let max = 0;
          for (let j = start; j < end; j += sampleStep) {
            const val = Math.abs(samples[j]);
            if (val > max) max = val;
          }
          if (max > peaks[b]) {
            peaks[b] = max;
          }
        }
      }

      const result: WaveformData = {
        peaks: Array.from(peaks),
        durationMs: audio.duration * 1000,
      };

      waveformCache.set(src, result);
      return result;
    } catch {
      return null;
    } finally {
      waveformPending.delete(src);
    }
  })();

  waveformPending.set(src, promise);
  return promise;
}

async function decodeWithAudioContext(buffer: ArrayBuffer): Promise<AudioBuffer> {
  if (typeof window === "undefined") throw new Error("AudioContext unavailable");
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("AudioContext unavailable");
  const ctx = new AudioCtx();
  try {
    return await ctx.decodeAudioData(buffer.slice(0));
  } finally {
    if (ctx.state !== "closed") {
      try { await ctx.close(); } catch { /* browser may close asynchronously */ }
    }
  }
}

function AudioWaveform({
  widthPx,
  src,
  sourceStartMs,
  durationMs,
}: {
  widthPx: number;
  src?: string;
  sourceStartMs: number;
  durationMs: number;
}) {
  const count = Math.max(12, Math.min(2048, Math.floor(widthPx / 3)));
  const [decoded, setDecoded] = useState<WaveformData | null>(() =>
    src ? waveformCache.get(src) ?? null : null,
  );
  const [loading, setLoading] = useState(() => Boolean(src && !waveformCache.has(src)));

  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setDecoded(null);
      setLoading(false);
      return;
    }

    const cached = waveformCache.get(src);
    if (cached) {
      setDecoded(cached);
      setLoading(false);
      return;
    }

    setDecoded(null);
    setLoading(true);

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async (attempt: number) => {
      const data = await loadWaveformData(src);
      if (!active) return;
      if (!data && attempt < 2) {
        retryTimer = setTimeout(() => void load(attempt + 1), 1000 * (attempt + 1));
        return;
      }
      setDecoded(data);
      setLoading(false);
    };
    void load(0);

    return () => {
      // The shared fetch must survive virtualization and React effect remounts.
      active = false;
      clearTimeout(retryTimer);
    };
  }, [src]);

  // Fast memoized bar heights
  const heights = useMemo(() => {
    if (!decoded || !decoded.peaks.length || decoded.durationMs <= 0) return null;
    const peakLen = decoded.peaks.length;
    const result = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const from = Math.floor(
        ((sourceStartMs + (i * durationMs) / count) / decoded.durationMs) * peakLen,
      );
      const to = Math.ceil(
        ((sourceStartMs + ((i + 1) * durationMs) / count) / decoded.durationMs) * peakLen,
      );
      let peak = 0;
      const startIdx = Math.max(0, from);
      const endIdx = Math.min(peakLen, Math.max(startIdx + 1, to));
      for (let j = startIdx; j < endIdx; j++) {
        if (decoded.peaks[j] > peak) peak = decoded.peaks[j];
      }
      result[i] = peak * 20;
    }
    return result;
  }, [count, decoded, sourceStartMs, durationMs]);

  return (
    <span
      data-waveform-state={heights ? "ready" : loading ? "loading" : "unavailable"}
      className={cn(
        "pointer-events-none absolute inset-x-1 inset-y-0 flex items-center gap-[1px] overflow-hidden",
        loading ? "opacity-45" : "opacity-90",
      )}
    >
      {heights ? Array.from(heights).map((h, i) => (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-sm bg-white/75"
              style={{ height: `${Math.max(1, Math.min(h, 20))}px` }}
            />
          )) : <span className="sticky left-2 truncate px-2 text-[10px] text-white/80">{loading ? "Loading waveform…" : "Waveform unavailable"}</span>}
    </span>
  );
}

/** Continuous filmstrip across the clip width — posters/sprites only (no MP4). */
function Filmstrip({
  thumbUrl,
  heightPx,
  onLoadError,
}: {
  thumbUrl: string;
  widthPx: number;
  heightPx: number;
  onLoadError: () => void;
  /** @deprecated Ignored — MP4 filmstrips are banned. */
  preferVideo?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const scrollRoot = el.closest<HTMLElement>("[data-timeline-scroll-root]");
    const io = new IntersectionObserver(
      ([entry]) => {
        // Release decoders for clips that leave the timeline viewport instead of
        // keeping every seen filmstrip mounted for the whole session.
        setVisible(Boolean(entry?.isIntersecting));
      },
      { root: scrollRoot, rootMargin: "160px 240px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // CSS backgrounds do not emit useful React image errors. Preflight through the
  // shared request cache so an expired poster does not remain blank forever.
  useEffect(() => {
    if (!visible || !thumbUrl) return;
    let cancelled = false;
    void prefetchMediaImage(thumbUrl).catch(() => {
      if (!cancelled) onLoadError();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, thumbUrl, onLoadError]);

  // Keep one stable observer host; only the media child changes as the clip
  // enters/leaves the actual horizontal timeline viewport.
  return (
    <span
      ref={hostRef}
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black/25"
      aria-hidden
    >
      {visible ? (
        <span
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${JSON.stringify(thumbUrl).slice(1, -1)})`,
            backgroundSize: `auto ${heightPx}px`,
            backgroundRepeat: "repeat-x",
            backgroundPosition: "left center",
            opacity: 0.9,
          }}
        />
      ) : null}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />
      <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]" />
    </span>
  );
}

interface TimelineClipBlockProps {
  item: TimelineItem;
  zoom: number;
  trackHeight: number;
  selected: boolean;
  /** A grouped timeline representation; selectable but not movable or trimmable. */
  presentationOnly?: boolean;
  captionSegments?: TimelineItem[];
  transition?: TransitionItem | null;
  showBoundary?: boolean;
  transitionSelected?: boolean;
  /** Stable parent callbacks keyed by item id — avoids per-frame identity churn. */
  onSelect: (itemId: string) => void;
  onSelectTransition?: (afterItemId: string, hasNext: boolean) => void;
  onOpenInspector?: () => void;
  /** Whether the next video clip abuts this one (transition seam). */
  hasNextAbut?: boolean;
}

function TimelineClipBlockInner({
  item,
  zoom,
  trackHeight,
  selected,
  presentationOnly = false,
  captionSegments,
  transition,
  showBoundary = false,
  transitionSelected = false,
  onSelect,
  onSelectTransition,
  onOpenInspector,
  hasNextAbut = false,
}: TimelineClipBlockProps) {
  // Intentionally NOT subscribed to playheadMs — that re-rendered every clip ~30fps.
  const durationMs = useEditorStore((s) => s.timeline.durationMs);
  const snappingEnabled = useEditorStore((s) => s.timeline.settings.snappingEnabled);
  const moveItem = useEditorStore((s) => s.moveItem);
  const trimItem = useEditorStore((s) => s.trimItem);
  const toggleItemHidden = useEditorStore((s) => s.toggleItemHidden);
  const toggleAgentPanel = useEditorStore((s) => s.toggleAgentPanel);
  const addAgentMentions = useEditorStore((s) => s.addAgentMentions);
  const agentMentioned = useEditorStore((s) => s.ui.agentMentionIds.includes(item.id));
  const showAgentMention = agentMentioned && !presentationOnly;
  const getAsset = useEditorStore((s) => s.getAsset);
  const [clipHovered, setClipHovered] = useState(false);

  const [thumbFailed, setThumbFailed] = useState(false);
  const handleThumbLoadError = useCallback(() => setThumbFailed(true), []);
  const [collision, setCollision] = useState(false);
  const dragRef = useRef<{
    mode: "move" | "trim-start" | "trim-end";
    startX: number;
    origStart: number;
    origEnd: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingMsRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const asset = "assetId" in item ? getAsset(item.assetId) : undefined;
  const variant = getClipVariant(item, asset?.sourceType);
  const isAudio = variant === "narration" || variant === "music" || variant === "sfx";
  const isClip = variant === "video" || variant === "image" || variant === "generated";
  const isTextish = variant === "text" || variant === "caption";
  // Filmstrips: posters / sprites / image thumbs only — never pull full MP4.
  const posterOrSprite =
    asset?.metadata?.posterUrl ||
    ("thumbnailUrl" in item && item.thumbnailUrl) ||
    asset?.thumbnailUrl ||
    asset?.metadata?.spriteUrl ||
    (asset?.mediaType === "image" ? asset.url : "") ||
    "";
  const rawThumb = String(posterOrSprite || "");
  const thumbCandidate = resolveMediaUrl(rawThumb) || undefined;
  const looksLikeVideo =
    Boolean(thumbCandidate) && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(thumbCandidate!);
  const thumb = looksLikeVideo ? undefined : thumbCandidate;
  const filmstripSrc = thumb;
  useEffect(() => setThumbFailed(false), [filmstripSrc]);
  const left = msToPx(item.startMs, zoom);
  const width = Math.max(msToPx(item.endMs - item.startMs, zoom), isTextish ? 20 : 24);
  const showFilmstrip = isClip && Boolean(filmstripSrc) && !thumbFailed && width > 36;
  const SHOW_LABEL_PX = isTextish ? 40 : 48;
  const showLabel = width >= SHOW_LABEL_PX;
  const showHideToggle = width >= 56;
  const displayLabel =
    (item.type === "captions" || item.type === "text") && "text" in item && item.text
      ? item.text
      : item.type === "animation" && "title" in item && item.title
        ? item.title
        : item.type === "animation" && "preset" in item && item.preset
          ? item.label || String(item.preset).replace(/-/g, " ")
          : item.label;

  const thresholdMs = snapThresholdMs(zoom);

  const applyDragMs = useCallback(
    (ms: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const tracks = useEditorStore.getState().timeline.tracks;
      const playheadMs = useEditorStore.getState().ui.playheadMs;
      const snapPoints = collectSnapPoints(tracks, playheadMs, item.id);

      if (drag.mode === "move") {
        const nextStart = snapTime(ms, snapPoints, snappingEnabled, thresholdMs);
        const { startMs, endMs } = proposedRangeForMove(item, nextStart);
        const hits = findOverlappingClipIds(tracks, item.id, startMs, endMs);
        setCollision(hits.length > 0);
        if (hits.length) return;
        moveItem(item.id, nextStart);
        return;
      }
      if (drag.mode === "trim-start") {
        const clamped = Math.max(0, Math.min(drag.origEnd - MIN_CLIP_MS, ms));
        const snapped = snapTime(clamped, snapPoints, snappingEnabled, thresholdMs);
        const { startMs, endMs } = snapDuration(snapped, drag.origEnd, MIN_CLIP_MS, durationMs);
        const hits = findOverlappingClipIds(tracks, item.id, startMs, endMs);
        setCollision(hits.length > 0);
        if (hits.length) return;
        trimItem(item.id, startMs, endMs);
        return;
      }
      const clamped = Math.max(drag.origStart + MIN_CLIP_MS, Math.min(durationMs, ms));
      const snapped = snapTime(clamped, snapPoints, snappingEnabled, thresholdMs);
      const { startMs, endMs } = snapDuration(drag.origStart, snapped, MIN_CLIP_MS, durationMs);
      const hits = findOverlappingClipIds(tracks, item.id, startMs, endMs);
      setCollision(hits.length > 0);
      if (hits.length) return;
      trimItem(item.id, startMs, endMs);
    },
    [durationMs, item, moveItem, snappingEnabled, thresholdMs, trimItem],
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
      const deltaMs = pxToMs(deltaPx, zoom);
      pendingMsRef.current =
        drag.mode === "move"
          ? drag.origStart + deltaMs
          : drag.mode === "trim-start"
            ? drag.origStart + deltaMs
            : drag.origEnd + deltaMs;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingMsRef.current != null) applyDragMs(pendingMsRef.current);
      });
    },
    [applyDragMs, zoom],
  );

  const endDrag = useCallback(
    (ev?: Event) => {
      const drag = dragRef.current;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingMsRef.current != null && drag?.moved) {
        applyDragMs(pendingMsRef.current);
      }
      pendingMsRef.current = null;
      if (drag?.moved) suppressClickRef.current = true;
      dragRef.current = null;
      setCollision(false);
      endGestureHistory();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag as EventListener);
      window.removeEventListener("pointercancel", endDrag as EventListener);
      if (ev && drag) {
        try {
          (ev.target as HTMLElement | null)?.releasePointerCapture?.(drag.pointerId);
        } catch {
          /* ignore */
        }
      }
    },
    [applyDragMs, onPointerMove],
  );

  const startDrag = (mode: "move" | "trim-start" | "trim-end", e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      mode,
      startX: e.clientX,
      origStart: item.startMs,
      origEnd: item.endMs,
      moved: false,
      pointerId: e.pointerId,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag as EventListener);
    window.addEventListener("pointercancel", endDrag as EventListener);
  };

  const canEdit =
    item.type === "video" ||
    item.type === "broll" ||
    item.type === "narration" ||
    item.type === "music" ||
    item.type === "sfx" ||
    item.type === "text" ||
    item.type === "captions" ||
    item.type === "animation";

  const hasEffect =
    variant === "generated" ||
    variant === "text" ||
    Boolean(transition && transition.transitionType !== "cut") ||
    Boolean(
      "animation" in item &&
        item.animation &&
        ((item.animation.in && item.animation.in.preset !== "none") ||
          (item.animation.out && item.animation.out.preset !== "none") ||
          (item.animation.loop && item.animation.loop.preset !== "none")),
    );

  const showFxBadge =
    hasEffect &&
    (variant === "generated" ||
      variant === "text" ||
      Boolean(
        "animation" in item &&
          item.animation &&
          ((item.animation.in && item.animation.in.preset !== "none") ||
            (item.animation.out && item.animation.out.preset !== "none") ||
            (item.animation.loop && item.animation.loop.preset !== "none")),
      ));

  return (
    <div>
      <div
        className="group/clip absolute top-0"
        style={{ left, width, height: trackHeight }}
        onPointerEnter={() => setClipHovered(true)}
        onPointerLeave={() => setClipHovered(false)}
      >
        <div
          data-timeline-clip-block
          data-agent-item-id={item.id}
          data-caption-layer={presentationOnly || undefined}
          className={cn(
            "relative flex h-full w-full select-none items-center overflow-hidden border text-[11px] font-medium transition-colors duration-150 ease-out",
            "rounded-[5px] [-webkit-user-select:none] [user-select:none]",
            VARIANT_STYLES[variant],
            !isAudio && !showFilmstrip && "px-1.5",
            selected &&
              !collision &&
              !showAgentMention &&
              !isAudio &&
              variant !== "text" &&
              variant !== "caption" &&
              "z-20 border-[#3B82F6] shadow-[0_0_0_1.5px_#3B82F6]",
            selected &&
              !collision &&
              !showAgentMention &&
              (isAudio || variant === "text" || variant === "caption") &&
              "z-20 border-white/90 shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]",
            showAgentMention &&
              !collision &&
              "border-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]",
            collision &&
              "z-30 shadow-[0_0_0_2px_#f87171,0_0_16px_rgba(239,68,68,0.45)] brightness-110",
            item.hidden && "opacity-40",
          )}
        >
        {presentationOnly && captionSegments?.length ? (
          <span className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            {captionSegments.map((segment) => {
              const laneDuration = Math.max(1, item.endMs - item.startMs);
              const segmentLeft = ((segment.startMs - item.startMs) / laneDuration) * 100;
              const segmentWidth = ((segment.endMs - segment.startMs) / laneDuration) * 100;
              return (
                <span
                  key={segment.id}
                  data-caption-cue
                  className="absolute inset-y-[2px] flex items-center overflow-hidden rounded-[3px] bg-zinc-100 px-1 text-[9px] text-zinc-700 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                  style={{ left: `${segmentLeft}%`, width: `max(1px, calc(${segmentWidth}% - 3px))` }}
                >
                  <span className="block truncate">{"text" in segment ? segment.text : segment.label}</span>
                </span>
              );
            })}
          </span>
        ) : null}
        {showFilmstrip && filmstripSrc ? (
          <Filmstrip
            thumbUrl={filmstripSrc}
            widthPx={width}
            heightPx={trackHeight}
            onLoadError={handleThumbLoadError}
          />
        ) : null}
        {/* Corner badges — play / image; motion graphics use inline star instead */}
        {isClip && width > 36 && variant !== "generated" && !clipHovered ? (
          <span
            className={cn(
              "pointer-events-none absolute left-1.5 top-1.5 z-20 inline-flex size-[15px] items-center justify-center rounded-full shadow-sm",
              variant === "image" || thumbFailed
                ? "bg-[#F97316] text-white"
                : "bg-[#2563EB] text-white",
            )}
            aria-hidden
          >
            {variant === "image" || thumbFailed ? (
              <ImageIcon className="size-2.5" />
            ) : (
              <Play className="size-2.5 fill-current" />
            )}
          </span>
        ) : null}

        {/* Effect sparkle on media clips that have enter/exit presets */}
        {showFxBadge &&
        variant !== "generated" &&
        variant !== "text" &&
        width > 52 &&
        !showAgentMention ? (
          <span
            className="pointer-events-none absolute right-1.5 top-1.5 z-20 inline-flex size-[15px] items-center justify-center rounded-md bg-violet-500/95 text-white shadow-[0_0_10px_rgba(139,92,246,0.55)]"
            title="Effect applied"
            aria-hidden
          >
            <Sparkles className="size-2.5" />
          </span>
        ) : null}

        {/* Premium trim end-caps (mockup) — only when selected */}
        {selected && canEdit && !presentationOnly && width > 48 ? (
          <>
            <TrimCapGrip side="left" tone={VARIANT_CAP[variant]} />
            <TrimCapGrip side="right" tone={VARIANT_CAP[variant]} />
          </>
        ) : null}

        {/* Invisible hit targets over the caps */}
        {canEdit && !presentationOnly && width > 40 && (
          <div
            role="presentation"
            data-trim-handle
            className="absolute left-0 top-0 z-30 h-full cursor-ew-resize bg-transparent"
            style={{ width: selected ? 12 : TRIM_HANDLE_PX }}
            onPointerDown={(e) => startDrag("trim-start", e)}
            aria-label="Trim in-point"
          />
        )}

        <div
          role="presentation"
          className={cn(
            "relative z-10 flex min-w-0 flex-1 cursor-pointer select-none items-center gap-1 text-left [-webkit-user-select:none] [user-select:none]",
            // Waveform is absolutely positioned, so the audio hit area needs an
            // explicit height even when zoom/scroll hides the inline label.
            isAudio ? "h-full justify-center px-3" : "px-1",
            selected && canEdit && !presentationOnly && "px-3",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onSelect(item.id);
            if (e.altKey) onOpenInspector?.();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            suppressClickRef.current = true;
            onSelect(item.id);
            const store = useEditorStore.getState();
            if (store.ui.agentMentionIds.includes(item.id)) store.removeAgentMention(item.id);
            else addAgentMentions([item.id]);
            toggleAgentPanel(true);
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-trim-handle]")) return;
            onSelect(item.id);
            if (canEdit && !presentationOnly && width > 40) startDrag("move", e);
          }}
        >
          {isAudio && <AudioWaveform
            widthPx={width}
            src={asset ? resolveMediaUrlOrFallback(asset.url, asset.metadata?.proxyUrl, asset.metadata?.sourceKey) : undefined}
            sourceStartMs={"sourceStartMs" in item ? item.sourceStartMs ?? 0 : 0}
            durationMs={item.endMs - item.startMs}
          />}
          {isAudio && showLabel ? (
            <span className="relative z-10 inline-flex max-w-[85%] items-center gap-1 truncate rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-[2px]">
              <Volume2 className="size-3 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">
                {displayLabel.includes(".") ? displayLabel : `${displayLabel}.mp3`}
              </span>
            </span>
          ) : null}
          {(variant === "generated" || variant === "text") && showLabel && (
            variant === "text" ? (
              <Type className="relative z-10 size-3.5 shrink-0 text-white drop-shadow" />
            ) : (
              <Sparkles className="relative z-10 size-3.5 shrink-0 text-white drop-shadow" />
            )
          )}
          {!isAudio && showLabel && !presentationOnly ? (
            <span
              className={cn(
                "relative z-10 min-w-0 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
                (variant === "generated" || variant === "text") &&
                  "pl-0.5 font-semibold leading-tight tracking-tight text-white",
                isClip && width > 36 && "pl-4",
              )}
              title={displayLabel}
            >
              {displayLabel}
            </span>
          ) : null}
        </div>
        {canEdit && !presentationOnly && width > 40 && (
          <div
            role="presentation"
            data-trim-handle
            className="absolute right-0 top-0 z-30 h-full cursor-ew-resize bg-transparent"
            style={{ width: selected ? 12 : TRIM_HANDLE_PX }}
            onPointerDown={(e) => startDrag("trim-end", e)}
            aria-label="Trim end"
          />
        )}
        </div>
      </div>

      {/* Real transitions: always-visible premium pill. Empty cuts: hover-only seam. */}
      {(() => {
        const hasReal =
          Boolean(transition) && transition!.transitionType !== "cut";
        if (!hasReal && !showBoundary) return null;
        if (hasReal) {
          return (
            <button
              type="button"
              data-transition-control
              className={cn(
                "absolute inset-y-0.5 z-30 flex w-6 -translate-x-1/2 cursor-pointer items-center justify-center rounded-[5px] border border-zinc-300 transition-colors hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-cyan-300",
                transitionSelected
                  ? "bg-white text-zinc-950 shadow-[0_0_0_2px_#60A5FA,0_0_12px_rgba(96,165,250,0.35)]"
                  : "bg-zinc-100 text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
              )}
              // The transition control is rendered in the lane-level wrapper,
              // so its coordinate must be global to the timeline canvas.
              style={{ left: msToPx(item.endMs, zoom) }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTransition?.(item.id, hasNextAbut);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={`${transition!.transitionType} transition`}
            >
              <Shuffle className="size-3 stroke-[2.5]" />
            </button>
          );
        }
        return (
          <div
            className="group/seam absolute z-30 -translate-x-1/2"
            style={{
              left: msToPx(item.endMs, zoom),
              top: 0,
              width: 20,
              height: trackHeight,
            }}
          >
            <button
              type="button"
              data-transition-control
              className="absolute inset-y-0.5 left-1/2 flex w-6 -translate-x-1/2 cursor-pointer items-center justify-center rounded-[5px] border border-zinc-300 bg-zinc-100 text-zinc-800 opacity-0 shadow-sm transition-opacity hover:bg-white hover:text-black focus-visible:opacity-100 group-hover/seam:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onSelectTransition?.(item.id, hasNextAbut);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Add transition"
            >
              <Shuffle className="size-3 stroke-[2.5]" />
            </button>
          </div>
        );
      })()}
    </div>
  );
}

export const TimelineClipBlock = memo(TimelineClipBlockInner);
