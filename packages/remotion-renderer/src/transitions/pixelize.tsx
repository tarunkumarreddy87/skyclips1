import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

/**
 * Pixelize approx: CSS image-rendering + scale mosaic during crossfade.
 * (True mosaic would need canvas; this reads as blocky dissolve.)
 */
const Pixelize: React.FC<TransitionPresentationComponentProps<Record<string, unknown>>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const p = presentationProgress;
  const blocks = interpolate(p, [0, 0.5, 1], [1, 28, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity =
    presentationDirection === "exiting"
      ? interpolate(p, [0, 1], [1, 0])
      : interpolate(p, [0, 1], [0, 1]);
  const scale = Math.max(blocks, 1);

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "50% 50%",
          filter: `blur(${Math.max(0, (scale - 1) * 0.15)}px)`,
          imageRendering: "pixelated",
        }}
      >
        <AbsoluteFill style={{ transform: `scale(${1 / scale})`, transformOrigin: "50% 50%" }}>
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const pixelizePresentation = (): TransitionPresentation<Record<string, unknown>> => ({
  component: Pixelize,
  props: {},
});
