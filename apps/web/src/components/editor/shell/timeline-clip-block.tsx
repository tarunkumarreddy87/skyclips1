"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  ImageIcon,
  Check,
  Play,
  Sparkles,
  Type,
  UnfoldHorizontal,
  Volume2,
} from "lucide-react";
import type { TimelineItem, TransitionItem } from "@/lib/editor/types";
import { useEditorStore, endGestureHistory } from "@/lib/editor/store";
import { collectSnapPoints, snapDuration, snapThresholdMs, snapTime } from "@/lib/editor/snap";
import {
  findOverlappingClipIds,
  proposedRangeForMove,
} from "@/lib/editor/clip-collision";
import { formatTimecode, msToPx, pxToMs } from "@/lib/editor/utils";
import { resolveMediaUrl } from "@/lib/editor/media-url";
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

/** Speech-like envelope + seeded detail (until decoded peaks ship). */
function seededWaveHeights(seed: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const t = i / Math.max(1, count - 1);
    // Phrase envelope: quiet edges, louder mid — reads as narration not noise.
    const envelope = 0.35 + 0.65 * Math.sin(Math.PI * t);
    const chatter = 0.55 + 0.45 * ((h % 1000) / 1000);
    const spike = h % 17 === 0 ? 1.35 : 1;
    out.push(Math.max(2, Math.round(16 * envelope * chatter * spike)));
  }
  return out;
}

function AudioWaveform({ seed, widthPx }: { seed: string; widthPx: number }) {
  const count = Math.max(12, Math.min(100, Math.floor(widthPx / 2.5)));
  const heights = useMemo(() => seededWaveHeights(seed, count), [seed, count]);
  return (
    <span className="pointer-events-none absolute inset-x-1 inset-y-0 flex items-center gap-[1px] overflow-hidden opacity-90">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-white/75"
          style={{ height: `${Math.max(4, Math.min(h + 2, 18))}px` }}
        />
      ))}
    </span>
  );
}

/** Continuous filmstrip across the clip width — one media element, viewport-gated. */
function Filmstrip({
  thumbUrl,
  heightPx,
  preferVideo = false,
}: {
  thumbUrl: string;
  widthPx: number;
  heightPx: number;
  preferVideo?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const isVideo = preferVideo || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(thumbUrl);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const scrollRoot = el.closest<HTMLElement>("[data-timeline-scroll-root]");
    const io = new IntersectionObserver(
      ([entry]) => {
        // Release decoders for clips that leave the timeline viewport instead of
        // keeping every seen video filmstrip mounted for the whole session.
        setVisible(Boolean(entry?.isIntersecting));
      },
      { root: scrollRoot, rootMargin: "160px 240px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep one stable observer host; only the media child changes as the clip
  // enters/leaves the actual horizontal timeline viewport.
  return (
    <span
      ref={hostRef}
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black/25"
      aria-hidden
    >
      {visible && isVideo ? (
        <video
          src={thumbUrl}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover opacity-90"
          onLoadedData={(e) => {
            try {
              const v = e.currentTarget;
              if (v.readyState >= 2 && v.currentTime < 0.05) v.currentTime = 0.08;
            } catch {
              /* ignore */
            }
          }}
        />
      ) : visible ? (
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
  transition?: TransitionItem | null;
  showBoundary?: boolean;
  transitionSelected?: boolean;
  onSelect: () => void;
  onSelectTransition?: () => void;
  onSeekToStart?: () => void;
  onOpenInspector?: () => void;
}

function TimelineClipBlockInner({
  item,
  zoom,
  trackHeight,
  selected,
  transition,
  showBoundary = false,
  transitionSelected = false,
  onSelect,
  onSelectTransition,
  onSeekToStart,
  onOpenInspector,
}: TimelineClipBlockProps) {
  // Intentionally NOT subscribed to playheadMs — that re-rendered every clip ~30fps.
  const durationMs = useEditorStore((s) => s.timeline.durationMs);
  const snappingEnabled = useEditorStore((s) => s.timeline.settings.snappingEnabled);
  const moveItem = useEditorStore((s) => s.moveItem);
  const trimItem = useEditorStore((s) => s.trimItem);
  const toggleItemHidden = useEditorStore((s) => s.toggleItemHidden);
  const toggleAgentPanel = useEditorStore((s) => s.toggleAgentPanel);
  const addAgentMentions = useEditorStore((s) => s.addAgentMentions);
  const agentBusy = useEditorStore((s) => s.ui.agentBusy);
  const agentMentionIds = useEditorStore((s) => s.ui.agentMentionIds);
  const getAsset = useEditorStore((s) => s.getAsset);
  const [clipHovered, setClipHovered] = useState(false);

  const [thumbFailed, setThumbFailed] = useState(false);
  const [collision, setCollision] = useState(false);
  const agentMentioned = agentMentionIds.includes(item.id);
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
  const rawThumb =
    ("thumbnailUrl" in item && item.thumbnailUrl) ||
    asset?.thumbnailUrl ||
    (asset?.mediaType === "image" ? asset.url : "") ||
    "";
  // Prefer image thumbs. Only fall back to the playable media URL for *visible*
  // video clips with no poster — Filmstrip is IntersectionObserver-gated and uses
  // preload=metadata so we don't pull every MP4 on timeline open.
  const thumb = resolveMediaUrl(String(rawThumb || "")) || undefined;
  const videoFallback =
    !thumb && isClip && asset?.mediaType === "video"
      ? resolveMediaUrl(asset.url) || undefined
      : undefined;
  const filmstripSrc = thumb || videoFallback;
  const filmstripIsVideo = Boolean(videoFallback) && !thumb;

  const left = msToPx(item.startMs, zoom);
  const width = Math.max(msToPx(item.endMs - item.startMs, zoom), isTextish ? 20 : 24);
  const showFilmstrip = isClip && Boolean(filmstripSrc) && !thumbFailed && width > 36;
  const SHOW_LABEL_PX = isTextish ? 40 : 48;
  const showLabel = width >= SHOW_LABEL_PX;
  const showHideToggle = width >= 56;
  const displayLabel =
    (item.type === "captions" || item.type === "text") && "text" in item && item.text
      ? item.text
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
          className={cn(
            "relative flex h-full w-full select-none items-center overflow-hidden border text-[10px] font-medium transition-[box-shadow,filter,border-color,transform] duration-150 ease-out",
            "rounded-[10px] [-webkit-user-select:none] [user-select:none]",
            VARIANT_STYLES[variant],
            !isAudio && !showFilmstrip && "px-1.5",
            selected &&
              !collision &&
              !agentMentioned &&
              !isAudio &&
              variant !== "text" &&
              "z-20 border-[#3B82F6] shadow-[0_0_0_1.5px_#3B82F6]",
            selected &&
              !collision &&
              !agentMentioned &&
              (isAudio || variant === "text") &&
              "z-20 border-white/90 shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]",
            agentMentioned &&
              !collision &&
              (agentBusy ? "editor-clip-agent-working" : "editor-clip-agent-mentioned"),
            collision &&
              "z-30 shadow-[0_0_0_2px_#f87171,0_0_16px_rgba(239,68,68,0.45)] brightness-110",
            item.hidden && "opacity-40",
          )}
        >
        {showFilmstrip && filmstripSrc ? (
          <Filmstrip
            thumbUrl={filmstripSrc}
            widthPx={width}
            heightPx={trackHeight}
            preferVideo={filmstripIsVideo}
          />
        ) : null}

        {/* Hover: duration chip (VisualTracks mock) */}
        {clipHovered && width > 72 && (
          <span className="pointer-events-none absolute left-1.5 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/75 px-2 py-0.5 text-[9px] font-medium tabular-nums text-white shadow-sm">
            {isClip ? "Video" : isAudio ? "Audio" : variant === "caption" ? "Caption" : "Clip"}{" "}
            {formatTimecode(item.endMs - item.startMs)}
          </span>
        )}

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

        {/* Agent mention / working indicator (Rush-style check) */}
        {agentMentioned && width > 36 ? (
          <span
            className={cn(
              "pointer-events-none absolute right-1.5 top-1/2 z-30 inline-flex size-[16px] -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#111] shadow-[0_0_10px_rgba(255,255,255,0.45)]",
              agentBusy && "editor-clip-agent-badge",
            )}
            title={agentBusy ? "Editor Agent working on this clip" : "Mentioned in Editor Agent"}
            aria-hidden
          >
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        ) : null}

        {/* Effect sparkle on media clips that have enter/exit presets */}
        {showFxBadge &&
        variant !== "generated" &&
        variant !== "text" &&
        width > 52 &&
        !agentMentioned ? (
          <span
            className="pointer-events-none absolute right-1.5 top-1.5 z-20 inline-flex size-[15px] items-center justify-center rounded-md bg-violet-500/95 text-white shadow-[0_0_10px_rgba(139,92,246,0.55)]"
            title="Effect applied"
            aria-hidden
          >
            <Sparkles className="size-2.5" />
          </span>
        ) : null}

        {/* Premium trim end-caps (mockup) — only when selected */}
        {selected && canEdit && width > 48 ? (
          <>
            <TrimCapGrip side="left" tone={VARIANT_CAP[variant]} />
            <TrimCapGrip side="right" tone={VARIANT_CAP[variant]} />
          </>
        ) : null}

        {/* Invisible hit targets over the caps */}
        {canEdit && width > 40 && (
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
            isAudio ? "justify-center px-3" : "px-1",
            selected && canEdit && "px-3",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onSelect();
            if (e.altKey) onOpenInspector?.();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            suppressClickRef.current = true;
            onSelect();
            addAgentMentions([item.id]);
            toggleAgentPanel(true);
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-trim-handle]")) return;
            onSelect();
            if (canEdit && width > 40) startDrag("move", e);
          }}
        >
          {isAudio && <AudioWaveform seed={item.id} widthPx={width} />}
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
          {!isAudio && showLabel ? (
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

        {canEdit && showHideToggle && !isAudio && (
          <div
            role="presentation"
            className="absolute right-5 top-1/2 z-20 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-white/60 opacity-0 hover:bg-black/50 hover:text-white group-hover/clip:opacity-100"
            title={item.hidden ? "Show" : "Hide"}
            onClick={(e) => {
              e.stopPropagation();
              toggleItemHidden(item.id);
            }}
          >
            {item.hidden ? <EyeOff className="size-2.5" /> : <Eye className="size-2.5" />}
          </div>
        )}

        {canEdit && width > 40 && (
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
            <div
              role="presentation"
              className={cn(
                "absolute z-30 flex size-[18px] -translate-x-1/2 cursor-pointer items-center justify-center rounded-[5px] transition-all duration-200 hover:scale-110",
                transitionSelected
                  ? "bg-white text-zinc-900 shadow-[0_0_0_2px_#4FD1ED,0_0_12px_rgba(79,209,237,0.45)]"
                  : "bg-[#E8E8EC] text-zinc-700 shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
              )}
              style={{ left: left + width, top: trackHeight / 2 - 9 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTransition?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={`${transition!.transitionType} transition`}
            >
              <UnfoldHorizontal className="size-2.5 stroke-[2.5]" />
            </div>
          );
        }
        return (
          <div
            className="group/seam absolute z-30 -translate-x-1/2"
            style={{
              left: left + width,
              top: 0,
              width: 20,
              height: trackHeight,
            }}
          >
            <div
              role="presentation"
              className="absolute left-1/2 top-1/2 flex size-[16px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[4px] bg-[#E8E8EC]/95 text-zinc-600 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-150 hover:scale-110 group-hover/seam:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onSelectTransition?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Add transition"
            >
              <UnfoldHorizontal className="size-2.5 stroke-[2.5]" />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export const TimelineClipBlock = memo(TimelineClipBlockInner);
