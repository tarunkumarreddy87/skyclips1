import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

/** Warm flicker + vignette + scanlines through black (clip-boundary film burn). */
const FilmBurn: React.FC<TransitionPresentationComponentProps<Record<string, unknown>>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const frame = useCurrentFrame();
  const burn = interpolate(presentationProgress, [0, 0.35, 0.65, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity =
    presentationDirection === "exiting"
      ? interpolate(presentationProgress, [0, 0.55, 1], [1, 0.35, 0])
      : interpolate(presentationProgress, [0, 0.45, 1], [0, 0.55, 1]);

  const flicker =
    0.85 + 0.15 * Math.sin(frame * 1.7) * Math.sin(frame * 0.31) * burn;
  const scratchX = ((frame * 47) % 100);

  return (
    <AbsoluteFill style={{ opacity: opacity * flicker }}>
      <AbsoluteFill
        style={{
          filter: `sepia(${burn * 0.45}) contrast(${1 + burn * 0.25}) brightness(${1 - burn * 0.15})`,
        }}
      >
        {children}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,90,20,0.5) 0%, rgba(40,10,0,0.85) 55%, rgba(0,0,0,0.95) 100%)",
          opacity: burn * 0.9,
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: burn * 0.45,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,220,160,0.07) 3px)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: burn * 0.55,
          background: `linear-gradient(90deg, transparent ${scratchX}%, rgba(255,255,255,0.35) ${scratchX + 0.4}%, transparent ${scratchX + 0.8}%)`,
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};

export const filmBurnPresentation = (): TransitionPresentation<Record<string, unknown>> => ({
  component: FilmBurn,
  props: {},
});
