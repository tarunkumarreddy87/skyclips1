import type { CSSProperties } from "react";
import type { ElementAnimation, AnimationPreset, LoopPreset } from "./types";

/**
 * Lightweight CSS approximation for editor preview only (ADR 0009).
 * Remotion owns export fidelity — do not treat this as render-accurate.
 */
export function previewMotionStyle(
  animation: ElementAnimation | undefined,
  startMs: number,
  endMs: number,
  playheadMs: number,
): CSSProperties {
  if (playheadMs < startMs || playheadMs >= endMs) return { opacity: 0 };
  if (!animation || (!animation.in && !animation.out && !animation.loop)) {
    return { opacity: 1 };
  }

  const local = playheadMs - startMs;
  const duration = Math.max(1, endMs - startMs);
  const inMs = animation.in?.durationMs ?? 0;
  const outMs = animation.out?.durationMs ?? 0;
  const style: CSSProperties = { opacity: 1 };

  if (animation.in && animation.in.preset !== "none" && inMs > 0 && local < inMs) {
    const t = clamp01(local / inMs);
    Object.assign(style, edgeStyle(animation.in.preset, t, "in"));
  } else if (
    animation.out &&
    animation.out.preset !== "none" &&
    outMs > 0 &&
    local > duration - outMs
  ) {
    const t = clamp01((duration - local) / outMs);
    Object.assign(style, edgeStyle(animation.out.preset, 1 - t, "out"));
  } else if (animation.loop && animation.loop.preset !== "none") {
    Object.assign(style, loopStyle(animation.loop.preset, playheadMs));
  }

  return style;
}

/** Defaults align with Remotion SubscribeCtaOverlay (pop in + pulse). */
export function defaultAnimationForMotionPreset(preset: string | undefined): ElementAnimation | undefined {
  if (preset === "subscribe-cta") {
    return {
      in: { preset: "pop", durationMs: 450 },
      loop: { preset: "pulse" },
    };
  }
  if (preset === "chapter-title" || preset === "lower-third") {
    return {
      in: { preset: "slide", durationMs: 500 },
      out: { preset: "fade", durationMs: 350 },
    };
  }
  return undefined;
}

export function previewMotionOverlayStyle(
  preset: string | undefined,
  animation: ElementAnimation | undefined,
  startMs: number,
  endMs: number,
  playheadMs: number,
): CSSProperties {
  return previewMotionStyle(
    animation ?? defaultAnimationForMotionPreset(preset),
    startMs,
    endMs,
    playheadMs,
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function edgeStyle(preset: AnimationPreset, t: number, edge: "in" | "out"): CSSProperties {
  const ease = 1 - Math.pow(1 - t, 2);
  switch (preset) {
    case "fade":
      return { opacity: edge === "in" ? ease : 1 - ease };
    case "float":
      return {
        opacity: ease,
        transform: `translateY(${(1 - ease) * (edge === "in" ? 18 : -18)}px)`,
      };
    case "zoom_in":
    case "ken_burns_in":
    case "parallax_pan_in":
      return {
        opacity: ease,
        transform: `scale(${0.82 + 0.18 * ease})`,
      };
    case "zoom_out":
    case "ken_burns_out":
    case "parallax_pan_out":
      return {
        opacity: ease,
        transform: `scale(${1.18 - 0.18 * ease})`,
      };
    case "drop":
      return {
        opacity: ease,
        transform: `translateY(${(1 - ease) * -40}px)`,
      };
    case "slide":
    case "slide_bounce":
      return {
        opacity: ease,
        transform: `translateX(${(1 - ease) * (edge === "in" ? -48 : 48)}px)`,
      };
    case "wipe":
      return {
        opacity: 1,
        clipPath: edge === "in" ? `inset(0 ${(1 - ease) * 100}% 0 0)` : `inset(0 0 0 ${ease * 100}%)`,
      };
    case "pop":
      return {
        opacity: ease,
        transform: `scale(${0.6 + 0.4 * ease})`,
      };
    case "bounce": {
      const bounce = Math.sin(ease * Math.PI);
      return {
        opacity: Math.min(1, ease * 1.2),
        transform: `translateY(${(1 - ease) * 28 - bounce * 6}px)`,
      };
    }
    case "spin":
      return {
        opacity: ease,
        transform: `rotate(${(1 - ease) * (edge === "in" ? -90 : 90)}deg) scale(${0.85 + 0.15 * ease})`,
      };
    default:
      return {};
  }
}

function loopStyle(preset: LoopPreset, playheadMs: number): CSSProperties {
  const phase = (playheadMs / 1000) * Math.PI;
  switch (preset) {
    case "pulse":
      return { transform: `scale(${1 + Math.sin(phase * 2) * 0.04})` };
    case "float":
      return { transform: `translateY(${Math.sin(phase) * 6}px)` };
    case "ken_burns":
      return { transform: `scale(${1.04 + Math.sin(phase * 0.4) * 0.03})` };
    case "parallax_pan": {
      const pan = Math.sin(phase * 0.35) * 4;
      return { transform: `translateX(${pan}%) scale(1.12)` };
    }
    default:
      return {};
  }
}
