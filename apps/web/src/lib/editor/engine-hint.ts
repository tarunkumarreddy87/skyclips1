/**
 * Client hint for Remotion-only exports (matches workers/media engine_select).
 * Product path always uses Remotion — this flags motion-rich timelines for copy.
 */

import type { Timeline } from "./types";

function animationActive(item: {
  animation?: {
    in?: { preset?: string };
    out?: { preset?: string };
    loop?: { preset?: string };
  };
}): boolean {
  const anim = item.animation;
  if (!anim) return false;
  for (const edge of [anim.in, anim.out] as const) {
    const p = edge?.preset;
    if (p && p !== "none") return true;
  }
  const loop = anim.loop?.preset;
  return Boolean(loop && loop !== "none");
}

/** True when the timeline has transitions/overlays/motion (Remotion shines here). */
export function timelineNeedsRemotion(timeline: Timeline): boolean {
  if (timeline.settings.showTransitions) {
    for (const t of timeline.transitions) {
      if (t.enabled === false) continue;
      if (t.transitionType === "cut" || t.durationMs <= 0) continue;
      return true;
    }
  }

  for (const track of timeline.tracks) {
    if (track.hidden) continue;
    if (track.type === "animation") {
      for (const item of track.items) {
        if (!item.hidden && item.type === "animation") return true;
      }
    }
    for (const item of track.items) {
      if (item.hidden) continue;
      if (
        (item.type === "video" ||
          item.type === "broll" ||
          item.type === "text" ||
          item.type === "captions" ||
          item.type === "animation") &&
        animationActive(item)
      ) {
        return true;
      }
    }
  }

  return false;
}
