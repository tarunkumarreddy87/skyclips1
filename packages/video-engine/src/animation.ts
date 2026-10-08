import type { ElementAnimation, ElementTransform, GraphicKeyframe } from "@hanuman/shared-types";
import { clamp } from "./timing.js";

export interface MotionState {
  x: number; y: number; scaleX: number; scaleY: number; rotation: number;
  opacity: number; offsetX: number; offsetY: number; reveal: number; zIndex: number;
}

export function easeOutCubic(progress: number): number {
  return 1 - (1 - clamp(progress)) ** 3;
}

function edge(preset: string, visible: number, entering: boolean): Partial<MotionState> {
  const p = easeOutCubic(visible);
  switch (preset) {
    case "none": return {};
    case "wipe": return { reveal: p };
    case "float": return { opacity: p, offsetY: (1 - p) * (entering ? 28 : -28) };
    case "drop": return { opacity: p, offsetY: -(1 - p) * 90 };
    case "slide": return { opacity: p, offsetX: (1 - p) * (entering ? -100 : 100) };
    case "slide_bounce": return { opacity: p, offsetX: -(1 - p) * 100 + Math.sin(p * Math.PI) * 8 };
    case "pop": return { opacity: p, scaleX: 0.72 + 0.28 * p, scaleY: 0.72 + 0.28 * p };
    case "bounce": return { opacity: p, offsetY: (1 - p) * 65 - Math.sin(p * Math.PI) * 12 };
    case "spin": return { opacity: p, rotation: -(1 - p) * 90 };
    case "zoom_in": case "ken_burns_in": case "parallax_pan_in":
      return { opacity: p, scaleX: 0.9 + p * 0.1, scaleY: 0.9 + p * 0.1 };
    case "zoom_out": case "ken_burns_out": case "parallax_pan_out":
      return { opacity: p, scaleX: 1.12 - p * 0.12, scaleY: 1.12 - p * 0.12 };
    default: return { opacity: p };
  }
}

/** Pure timestamp evaluation; no wall clock, random state, or accumulated playback. */
export function evaluateAnimation(
  transform: ElementTransform | undefined,
  animation: ElementAnimation | undefined,
  localSec: number,
  durationSec: number,
): MotionState {
  const state: MotionState = {
    x: transform?.x ?? 50, y: transform?.y ?? 50,
    scaleX: transform?.scaleX ?? 1, scaleY: transform?.scaleY ?? 1,
    rotation: transform?.rotation ?? 0, zIndex: transform?.zIndex ?? 0,
    opacity: localSec < 0 || localSec >= durationSec ? 0 : 1,
    offsetX: 0, offsetY: 0, reveal: 1,
  };
  if (state.opacity === 0) return state;
  let motion: Partial<MotionState> = {};
  const inSec = Math.min(durationSec / 2, animation?.in?.duration_sec ?? 0.4);
  const outSec = Math.min(durationSec / 2, animation?.out?.duration_sec ?? 0.3);
  if (animation?.in && inSec > 0 && localSec < inSec) {
    motion = edge(animation.in.preset, localSec / inSec, true);
  } else if (animation?.out && outSec > 0 && localSec >= durationSec - outSec) {
    motion = edge(animation.out.preset, (durationSec - localSec) / outSec, false);
  } else if (animation?.loop) {
    const phase = localSec * Math.PI;
    switch (animation.loop.preset) {
      case "pulse": motion = { scaleX: 1 + Math.sin(phase * 2) * 0.025, scaleY: 1 + Math.sin(phase * 2) * 0.025 }; break;
      case "float": motion = { offsetY: Math.sin(phase) * 12 }; break;
      case "ken_burns": motion = { scaleX: 1 + clamp(localSec / durationSec) * 0.08, scaleY: 1 + clamp(localSec / durationSec) * 0.08 }; break;
      case "parallax_pan": {
        const params = animation.loop.params;
        const progress = clamp(localSec / durationSec);
        const direction = params?.direction ?? "left-right";
        const sign = direction === "left-right" || direction === "top-bottom" ? 1 : -1;
        const distance = clamp(params?.foreground_speed ?? 0.035, 0, 0.3) * 1920;
        const vertical = direction === "top-bottom" || direction === "bottom-top";
        const scale = clamp(params?.scale ?? 1.12, 1, 2);
        motion = { scaleX: scale, scaleY: scale, offsetX: vertical ? 0 : (progress - 0.5) * distance * sign,
          offsetY: vertical ? (progress - 0.5) * distance * sign : 0 };
        break;
      }
    }
  }
  return {
    ...state, ...motion,
    scaleX: state.scaleX * (motion.scaleX ?? 1), scaleY: state.scaleY * (motion.scaleY ?? 1),
    rotation: state.rotation + (motion.rotation ?? 0),
  };
}

/** Sparse channels interpolate independently; omitted values keep their base value. */
export function applyKeyframes(state: MotionState, keyframes: GraphicKeyframe[] | undefined, localSec: number): MotionState {
  if (!keyframes?.length) return state;
  const sorted = [...keyframes].sort((a, b) => a.time_sec - b.time_sec);
  const next = { ...state };
  for (const property of ["x", "y", "scale", "rotation", "opacity"] as const) {
    const base = property === "scale" ? 1 : state[property];
    const authored = sorted.filter((key) => key[property] != null);
    if (!authored.length) continue;
    const points = authored[0]!.time_sec > 0
      ? [{ time_sec: 0, [property]: base }, ...authored] : authored;
    let value = Number(points[0]![property as keyof typeof points[0]]);
    for (let i = 1; i < points.length; i++) {
      const left = points[i - 1]!; const right = points[i]!;
      if (localSec >= right.time_sec) { value = Number(right[property as keyof typeof right]); continue; }
      const progress = clamp((localSec - left.time_sec) / Math.max(0.001, right.time_sec - left.time_sec));
      value = Number(left[property as keyof typeof left]) +
        (Number(right[property as keyof typeof right]) - Number(left[property as keyof typeof left])) * easeOutCubic(progress);
      break;
    }
    if (property === "scale") { next.scaleX *= value; next.scaleY *= value; }
    else next[property] = value;
  }
  next.opacity = clamp(next.opacity);
  return next;
}
