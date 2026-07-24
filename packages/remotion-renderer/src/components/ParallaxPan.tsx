/**
 * Free Remotion Template Component (adapted)
 * ---------------------------------
 * Original template from https://www.reactvideoeditor.com — credit appreciated.
 *
 * Frame-driven parallax pan: foreground and background layers move at different
 * speeds via Remotion interpolate(), deterministic in preview and Lambda export.
 */

import React from "react";
import { Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ElementAnimation, ParallaxPanParams } from "../lib/types";
import { secToFrames } from "../lib/timing";

export type ParallaxDirection = NonNullable<ParallaxPanParams["direction"]>;

export function isParallaxAnimation(animation: ElementAnimation | undefined): boolean {
  if (!animation) return false;
  const presets = [animation.in?.preset, animation.out?.preset, animation.loop?.preset];
  return presets.some(
    (p) => p === "parallax_pan" || p === "parallax_pan_in" || p === "parallax_pan_out",
  );
}

function resolveConfig(animation: ElementAnimation | undefined, override?: ParallaxPanParams): Required<ParallaxPanParams> {
  const params = override ?? animation?.loop?.params ?? {};
  return {
    direction: params.direction ?? "left-right",
    scale: params.scale ?? 1.2,
    foreground_speed: params.foreground_speed ?? 1,
    background_speed: params.background_speed ?? 0.45,
  };
}

function panRange(
  t: number,
  speed: number,
  direction: ParallaxDirection,
): number {
  const amount = 20 * speed;
  switch (direction) {
    case "right-left":
      return interpolate(t, [0, 1], [-amount, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
    case "top-bottom":
      return interpolate(t, [0, 1], [0, -amount], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
    case "bottom-top":
      return interpolate(t, [0, 1], [-amount, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
    case "left-right":
    default:
      return interpolate(t, [0, 1], [0, -amount], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
  }
}

export function parallaxLayerTransforms(
  t: number,
  config: Required<ParallaxPanParams>,
): { foreground: string; background: string } {
  const fgScale = config.scale;
  const bgScale = config.scale * 1.08;
  const dir = config.direction;

  if (dir === "top-bottom" || dir === "bottom-top") {
    const fgY = panRange(t, config.foreground_speed, dir);
    const bgY = panRange(t, config.background_speed, dir);
    return {
      foreground: `translateY(${fgY}%) scale(${fgScale})`,
      background: `translateY(${bgY}%) scale(${bgScale})`,
    };
  }

  const fgX = panRange(t, config.foreground_speed, dir);
  const bgX = panRange(t, config.background_speed, dir);
  return {
    foreground: `translateX(${fgX}%) scale(${fgScale})`,
    background: `translateX(${bgX}%) scale(${bgScale})`,
  };
}

function clipOpacity(animation: ElementAnimation | undefined, frame: number, durationInFrames: number, fps: number): number {
  let opacity = 1;
  const inPreset = animation?.in?.preset;
  const outPreset = animation?.out?.preset;
  const inFrames = secToFrames(animation?.in?.duration_sec ?? 0.6, fps);
  const outFrames = secToFrames(animation?.out?.duration_sec ?? 0.6, fps);

  if (inPreset && inPreset !== "none" && frame < inFrames) {
    opacity *= interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  if (outPreset && outPreset !== "none" && frame > durationInFrames - outFrames) {
    opacity *= interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  return opacity;
}

const layerBase: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

/** Dual-layer parallax pan for still clips (A-roll / B-roll images). */
export const ParallaxPanClip: React.FC<{
  imageUrl: string;
  fit?: "cover" | "contain";
  animation?: ElementAnimation;
  durationInFrames: number;
  config?: ParallaxPanParams;
}> = ({ imageUrl, fit = "cover", animation, durationInFrames, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const resolved = resolveConfig(animation, config);
  const t = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const { foreground, background } = parallaxLayerTransforms(t, resolved);
  const opacity = clipOpacity(animation, frame, durationInFrames, fps);
  const mediaFit = fit;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#000",
        opacity,
      }}
    >
      <Img
        src={imageUrl}
        style={{
          ...layerBase,
          objectFit: mediaFit,
          transform: background,
          filter: "blur(2px) brightness(0.72)",
          transformOrigin: "center center",
        }}
      />
      <Img
        src={imageUrl}
        style={{
          ...layerBase,
          objectFit: mediaFit,
          transform: foreground,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
};

export default ParallaxPanClip;
