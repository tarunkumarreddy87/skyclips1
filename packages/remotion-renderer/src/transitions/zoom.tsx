import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

/** Zoom-through crossfade: exiting zooms in + fades; entering starts zoomed and settles. */
const ZoomCross: React.FC<TransitionPresentationComponentProps<Record<string, unknown>>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const p = presentationProgress;
  if (presentationDirection === "exiting") {
    const scale = interpolate(p, [0, 1], [1, 1.45]);
    const opacity = interpolate(p, [0, 1], [1, 0]);
    return (
      <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
        {children}
      </AbsoluteFill>
    );
  }
  const scale = interpolate(p, [0, 1], [1.35, 1]);
  const opacity = interpolate(p, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
      {children}
    </AbsoluteFill>
  );
};

export const zoomPresentation = (): TransitionPresentation<Record<string, unknown>> => ({
  component: ZoomCross,
  props: {},
});
