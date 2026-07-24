/**
 * Dual-clip layer styles for editorClock preview transitions.
 * Mirrors apps/web preview-transition.ts so live preview ≈ CSS scrub ≈ export intent.
 */

import type React from "react";

/** Max gap still treated as abutting (matches web TRANSITION_ABUT_EPSILON_MS). */
const ABUT_EPSILON_SEC = 0.08;

function clipsAbutSec(earlierEndSec: number, laterStartSec: number): boolean {
  return Math.abs(laterStartSec - earlierEndSec) <= ABUT_EPSILON_SEC;
}

export interface DualClipLayerStyles {
  from: React.CSSProperties;
  to: React.CSSProperties;
}

export function dualClipTransitionStyles(
  type: string,
  progress: number,
): DualClipLayerStyles {
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

  return {
    from: { opacity: 1 - p },
    to: { opacity: p },
  };
}

export interface ActiveEditorTransition {
  type: string;
  progress: number;
  durationSec: number;
  startSec: number;
  endSec: number;
  fromId: string;
  toId: string;
}

/** Transition blend window on the editor absolute clock (matches web findActiveTransitionScrub). */
export function findActiveEditorTransition(
  nowSec: number,
  videos: { id: string; start_sec: number; duration_sec: number }[],
  transitions: { after_clip_id: string; type: string; duration_sec: number; enabled?: boolean }[],
): ActiveEditorTransition | null {
  const sorted = [...videos].sort((a, b) => a.start_sec - b.start_sec);
  for (const t of transitions) {
    if (t.enabled === false || t.type === "cut" || t.duration_sec <= 0) continue;
    const after = sorted.find((v) => v.id === t.after_clip_id);
    if (!after) continue;
    const afterEnd = after.start_sec + after.duration_sec;
    const idx = sorted.findIndex((v) => v.id === after.id);
    const next = idx >= 0 ? sorted[idx + 1] : undefined;
    if (!next || !clipsAbutSec(afterEnd, next.start_sec)) continue;
    const start = afterEnd - t.duration_sec;
    const end = afterEnd;
    if (nowSec < start || nowSec >= end) continue;
    const progress = Math.max(0, Math.min(1, (nowSec - start) / t.duration_sec));
    return {
      type: t.type,
      progress,
      durationSec: t.duration_sec,
      startSec: start,
      endSec: end,
      fromId: after.id,
      toId: next.id,
    };
  }
  return null;
}
