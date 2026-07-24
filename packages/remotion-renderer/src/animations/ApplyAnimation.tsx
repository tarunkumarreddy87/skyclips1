import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { ElementAnimation } from "../lib/types";
import { secToFrames } from "../lib/timing";
import {
  IN_PRESETS,
  OUT_PRESETS,
  applyLoopStyle,
  combineStyles,
  identityStyle,
  type AnimatedStyle,
} from "./presets";

export type AnimationPhase = "in" | "out" | "loop" | "all";

/**
 * Single entry for composition builders: resolve In/Out/Loop from timeline.v1
 * `animation` using absolute-timeline durations (`duration_sec` → frames).
 */
export function useApplyAnimation(
  animation: ElementAnimation | undefined,
  durationInFrames: number,
  disableAnimations = false,
): AnimatedStyle {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (disableAnimations) return { ...identityStyle };
  const inPreset = animation?.in?.preset ?? "none";
  const outPreset = animation?.out?.preset ?? "none";
  const inFrames = secToFrames(animation?.in?.duration_sec ?? 0.6, fps);
  const outFrames = secToFrames(animation?.out?.duration_sec ?? 0.6, fps);
  const input = { frame, fps, durationInFrames, inFrames, outFrames };

  let style: AnimatedStyle = { ...identityStyle };
  const inFn = IN_PRESETS[inPreset];
  if (inFn) style = combineStyles(style, inFn(input));
  const outFn = OUT_PRESETS[outPreset];
  if (outFn) style = combineStyles(style, outFn(input));
  if (animation?.loop?.preset) {
    style = applyLoopStyle(style, animation.loop.preset, frame, fps);
  }
  return style;
}

export const ApplyAnimation: React.FC<{
  animation?: ElementAnimation;
  durationInFrames: number;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
  /** Temporary A/B: skip preset math (identity style). */
  disableAnimations?: boolean;
}> = ({ animation, durationInFrames, style, className, children, disableAnimations = false }) => {
  const anim = useApplyAnimation(animation, durationInFrames, disableAnimations);
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        opacity: anim.opacity,
        transform: anim.transform,
        clipPath: anim.clipPath,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
