import type { TimelineItem, TransitionItem } from "@/lib/editor/types";
import { clipsAbut } from "./transition-abut";
import type { CSSProperties } from "react";

export interface DualClipLayerStyles { from: CSSProperties; to: CSSProperties }
export const dualClipTransitionStyles = dualClipScrubStyles;
export function transitionOverlayStyle(type: string, progress: number): CSSProperties { return transitionScrubStyle(type, progress).overlay; }

export interface ActiveTransitionScrub {
  type: string;
  progress: number;
  durationMs: number;
  fromItemId: string;
  toItemId: string | null;
}

/** Find an enabled transition whose native engine blend window contains the playhead. */
export function findActiveTransitionScrub(
  playheadMs: number,
  transitions: TransitionItem[],
  items: TimelineItem[],
): ActiveTransitionScrub | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  // Export transitions bind after_clip_id on the video track only — match that here.
  const videoOnly = items
    .filter((i) => i.type === "video")
    .sort((a, b) => a.startMs - b.startMs);

  for (const t of transitions) {
    if (!t.enabled || t.transitionType === "cut" || t.durationMs <= 0) continue;
    const after = byId.get(t.afterItemId);
    if (!after || after.type !== "video") continue;
    const idx = videoOnly.findIndex((i) => i.id === after.id);
    const next = idx >= 0 ? videoOnly[idx + 1] : undefined;
    if (!next || !clipsAbut(after.endMs, next.startMs)) continue;
    const start = after.endMs - t.durationMs;
    const end = after.endMs;
    // Exclusive upper bound — at exactly `end` the incoming clip is already the
    // active scene; an inclusive check here caused a 1-frame double-clip glitch.
    if (playheadMs < start || playheadMs >= end) continue;
    const progress = Math.max(0, Math.min(1, (playheadMs - start) / t.durationMs));
    return {
      type: t.transitionType,
      progress,
      durationMs: t.durationMs,
      fromItemId: after.id,
      toItemId: next.id,
    };
  }
  return null;
}
/** Layer styles for outgoing/incoming clips during scrub (approximate native engine). */
export function dualClipScrubStyles(type: string, progress: number): DualClipLayerStyles {
  const p = Math.max(0, Math.min(1, progress));
  const key = type.toLowerCase();

  if (key === "film-burn") {
    const burn = Math.sin(p * Math.PI);
    return {
      from: {
        opacity: 1 - p * 0.85,
        filter: `sepia(${burn * 0.5}) contrast(${1 + burn * 0.2}) brightness(${1 - burn * 0.2})`,
        transform: `scale(${1 + burn * 0.04})`,
      },
      to: {
        opacity: p,
        filter: `sepia(${burn * 0.35}) contrast(${1 + burn * 0.15})`,
        transform: `scale(${0.96 + p * 0.04})`,
      },
    };
  }

  if (key.includes("wipeleft") || key === "slideleft" || key === "slide-pan") {
    return {
      from: { clipPath: `inset(0 ${p * 100}% 0 0)` },
      to: { clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` },
    };
  }
  if (key.includes("wiperight") || key === "slideright" || key === "slide") {
    return {
      from: { clipPath: `inset(0 0 0 ${p * 100}%)` },
      to: { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` },
    };
  }
  if (key.includes("wipeup") || key === "slideup") {
    return {
      from: { clipPath: `inset(0 0 ${p * 100}% 0)` },
      to: { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` },
    };
  }
  if (key.includes("wipedown") || key === "slidedown") {
    return {
      from: { clipPath: `inset(${p * 100}% 0 0 0)` },
      to: { clipPath: `inset(0 0 ${(1 - p) * 100}% 0)` },
    };
  }
  if (key.includes("zoom") || key.includes("circle")) {
    return {
      from: { opacity: 1 - p, transform: `scale(${1 + p * 0.12})` },
      to: { opacity: p, transform: `scale(${0.92 + p * 0.08})` },
    };
  }
  if (key === "glitch" || key === "pixelize") {
    const shake = Math.sin(p * Math.PI * 8) * (key === "glitch" ? 4 : 0);
    return {
      from: {
        opacity: 1 - p * 0.9,
        filter: p > 0.25 ? "contrast(1.35) saturate(1.5) hue-rotate(-8deg)" : undefined,
        transform: `translateX(${-shake}px)`,
      },
      to: {
        opacity: p,
        filter: p < 0.75 ? "contrast(1.25) saturate(1.2)" : undefined,
        transform: `translateX(${shake}px)`,
      },
    };
  }

  // fade / dissolve / default
  return {
    from: { opacity: 1 - p },
    to: { opacity: p },
  };
}

/** Lightweight CSS overlay mimicking native engine effects while scrubbing. */
export function transitionScrubStyle(
  type: string,
  progress: number,
): { overlay: CSSProperties; curtain?: CSSProperties; scratch?: CSSProperties } {
  const p = Math.max(0, Math.min(1, progress));
  const key = type.toLowerCase();
  const burn = Math.sin(p * Math.PI);

  if (key === "film-burn") {
    const scratchX = (p * 73) % 100;
    return {
      overlay: {
        opacity: burn * 0.88,
        background:
          "radial-gradient(ellipse at center, rgba(255,90,20,0.55) 0%, rgba(40,10,0,0.82) 55%, rgba(0,0,0,0.95) 100%)",
        mixBlendMode: "multiply",
        pointerEvents: "none",
      },
      curtain: {
        position: "absolute",
        inset: 0,
        opacity: burn * 0.4,
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,220,160,0.08) 3px)",
        pointerEvents: "none",
      },
      scratch: {
        position: "absolute",
        inset: 0,
        opacity: burn * 0.5,
        background: `linear-gradient(90deg, transparent ${scratchX}%, rgba(255,255,255,0.4) ${scratchX + 0.5}%, transparent ${scratchX + 1}%)`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      },
    };
  }

  if (key === "glitch" || key === "pixelize") {
    return {
      overlay: {
        opacity: burn * 0.4,
        background:
          key === "glitch"
            ? "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.22) 2px, rgba(0,255,136,0.22) 4px)"
            : "repeating-conic-gradient(#111 0% 25%, #333 0% 50%) 50% / 14px 14px",
        mixBlendMode: key === "glitch" ? "screen" : "normal",
        pointerEvents: "none",
      },
    };
  }

  return { overlay: { opacity: 0, pointerEvents: "none" } };
}
