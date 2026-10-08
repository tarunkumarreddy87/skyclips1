import type { TimelineManifestV1, VideoClip } from "@hanuman/shared-types";
import { evaluateAnimation, type MotionState } from "./animation.js";
import { activeAt, clamp } from "./timing.js";

export interface MediaFrame {
  clip: VideoClip;
  sourceTimeSec: number;
  held: boolean;
  motion: MotionState;
  transition: { opacity: number; translateXPct: number; translateYPct: number; scale: number; clipPath?: string };
}

/** End-before-boundary transitions preserve all source starts and timeline duration. */
export function evaluateMediaFrame(manifest: TimelineManifestV1, timeSec: number): MediaFrame[] {
  const video = [...manifest.tracks.video].sort((a, b) => a.start_sec - b.start_sec);
  const layers: MediaFrame[] = [];
  const add = (clip: VideoClip, held = false): MediaFrame => {
    const localSec = held ? 0 : Math.max(0, timeSec - clip.start_sec);
    const layer: MediaFrame = {
      clip, held, sourceTimeSec: (clip.source_start_sec ?? 0) + localSec,
      motion: evaluateAnimation(clip.transform, clip.animation, localSec, clip.duration_sec),
      transition: { opacity: 1, translateXPct: 0, translateYPct: 0, scale: 1 },
    };
    layers.push(layer);
    return layer;
  };
  for (const clip of video) if (activeAt(clip, timeSec)) add(clip);
  for (const transition of manifest.transitions ?? []) {
    if (transition.enabled === false || transition.type === "cut" || transition.duration_sec <= 0) continue;
    const index = video.findIndex((clip) => clip.id === transition.after_clip_id);
    const left = video[index]; const right = video[index + 1];
    if (!left || !right || Math.abs(left.start_sec + left.duration_sec - right.start_sec) > 0.002) continue;
    const duration = Math.min(transition.duration_sec, left.duration_sec / 2, right.duration_sec / 2);
    const end = left.start_sec + left.duration_sec;
    if (timeSec < end - duration || timeSec >= end) continue;
    const from = layers.find((layer) => layer.clip.id === left.id);
    if (!from) continue;
    const to = add(right, true);
    // First-frame media handles are visible even when the incoming clip has an entrance.
    to.motion.opacity = 1;
    const p = clamp((timeSec - (end - duration)) / duration);
    const type = transition.type;
    if (type.startsWith("wipe")) {
      to.transition.clipPath = type === "wipeleft" ? `inset(0 ${(1 - p) * 100}% 0 0)`
        : type === "wiperight" ? `inset(0 0 0 ${(1 - p) * 100}%)`
        : type === "wipeup" ? `inset(0 0 ${(1 - p) * 100}% 0)`
        : `inset(${(1 - p) * 100}% 0 0 0)`;
    } else if (type.startsWith("slide")) {
      const vertical = type === "slideup" || type === "slidedown";
      const sign = type === "slideright" || type === "slidedown" || type === "slide" ? 1 : -1;
      if (vertical) { from.transition.translateYPct = sign * p * 100; to.transition.translateYPct = -sign * (1 - p) * 100; }
      else { from.transition.translateXPct = sign * p * 100; to.transition.translateXPct = -sign * (1 - p) * 100; }
    } else if (type === "circleopen" || type === "circleclose") {
      if (type === "circleopen") to.transition.clipPath = `circle(${p * 72}% at 50% 50%)`;
      else { from.transition.clipPath = `circle(${(1 - p) * 72}% at 50% 50%)`; layers.splice(layers.indexOf(to), 1); layers.unshift(to); }
    } else {
      // Incoming over opaque outgoing: alpha blend avoids a black dip mid-dissolve.
      to.transition.opacity = p;
      if (type === "zoom") { from.transition.scale = 1 + p * 0.12; to.transition.scale = 0.92 + p * 0.08; }
    }
  }
  for (const clip of manifest.tracks.broll ?? []) if (activeAt(clip, timeSec)) add(clip);
  return layers;
}
