import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

const Glitch: React.FC<TransitionPresentationComponentProps<Record<string, unknown>>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const frame = useCurrentFrame();
  const opacity =
    presentationDirection === "exiting"
      ? interpolate(presentationProgress, [0, 1], [1, 0])
      : interpolate(presentationProgress, [0, 1], [0, 1]);
  const shake = Math.sin(frame * 2.7) * 8 * presentationProgress;
  const split = Math.cos(frame * 3.1) * 6 * presentationProgress;

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          transform: `translate(${shake}px, ${split}px)`,
          filter: `hue-rotate(${presentationProgress * 40}deg) contrast(${1 + presentationProgress})`,
        }}
      >
        {children}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: presentationProgress * 0.4,
          background:
            "repeating-linear-gradient(90deg, rgba(0,255,255,0.15), rgba(255,0,80,0.15) 4px, transparent 8px)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

export const glitchPresentation = (): TransitionPresentation<Record<string, unknown>> => ({
  component: Glitch,
  props: {},
});
