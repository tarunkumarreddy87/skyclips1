import { Easing, interpolate, spring } from "remotion";
import type { AnimationPreset, LoopPreset } from "../lib/types";

export interface AnimatedStyle {
  opacity: number;
  transform: string;
  clipPath?: string;
}

export interface PresetInput {
  frame: number;
  fps: number;
  durationInFrames: number;
  inFrames: number;
  outFrames: number;
}

export type PresetFn = (input: PresetInput) => Partial<AnimatedStyle>;

export const identityStyle: AnimatedStyle = { opacity: 1, transform: "none" };

export function combineStyles(a: AnimatedStyle, b: Partial<AnimatedStyle>): AnimatedStyle {
  const transforms = [a.transform, b.transform].filter((t) => t && t !== "none").join(" ");
  return {
    opacity: (b.opacity ?? 1) * a.opacity,
    transform: transforms || "none",
    clipPath: b.clipPath ?? a.clipPath,
  };
}

/**
 * Soft in-opacity floor so scrubbing/paused playhead at clip start isn't a black frame.
 * Still reads as a fade/zoom in during playback; export stays premium, not harsh from black.
 */
function softInOpacity(t: number, floor = 0.42): number {
  const c = Math.max(0, Math.min(1, t));
  return floor + (1 - floor) * c;
}

const fadeIn: PresetFn = ({ frame, inFrames }) => ({
  opacity: softInOpacity(
    interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  ),
});

const fadeOut: PresetFn = ({ frame, durationInFrames, outFrames }) => ({
  opacity: interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
});

const floatIn: PresetFn = ({ frame, fps, inFrames }) => {
  const t = spring({ frame, fps, config: { damping: 18 }, durationInFrames: inFrames });
  return {
    opacity: softInOpacity(t),
    transform: `translateY(${interpolate(t, [0, 1], [40, 0])}px)`,
  };
};

const floatOut: PresetFn = ({ frame, durationInFrames, outFrames }) => ({
  opacity: interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(
    frame,
    [durationInFrames - outFrames, durationInFrames],
    [0, -36],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )}px)`,
});

const zoomIn: PresetFn = ({ frame, inFrames }) => {
  const t = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return {
    opacity: softInOpacity(t),
    transform: `scale(${interpolate(t, [0, 1], [1.18, 1])})`,
  };
};

const zoomOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: interpolate(t, [0, 1], [1, 0]),
    transform: `scale(${interpolate(t, [0, 1], [1, 1.3])})`,
  };
};

const kenBurnsIn: PresetFn = ({ frame, durationInFrames }) => {
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { transform: `scale(${interpolate(t, [0, 1], [1, 1.12])})` };
};

const kenBurnsOut: PresetFn = ({ frame, durationInFrames }) => {
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { transform: `scale(${interpolate(t, [0, 1], [1.12, 1])})` };
};

const dropIn: PresetFn = ({ frame, fps, inFrames }) => {
  const t = spring({ frame, fps, config: { damping: 12, mass: 0.8 }, durationInFrames: inFrames });
  return {
    opacity: softInOpacity(Math.min(1, t * 1.2)),
    transform: `translateY(${interpolate(t, [0, 1], [-120, 0])}px)`,
  };
};

const dropOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  return { opacity: 1 - t, transform: `translateY(${interpolate(t, [0, 1], [0, 100])}px)` };
};

const slideIn: PresetFn = ({ frame, inFrames }) => {
  const t = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return {
    opacity: softInOpacity(t),
    transform: `translateX(${interpolate(t, [0, 1], [80, 0])}px)`,
  };
};

const slideOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity: 1 - t, transform: `translateX(${interpolate(t, [0, 1], [0, -80])}px)` };
};

const wipeIn: PresetFn = ({ frame, inFrames }) => {
  const t = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { clipPath: `inset(0 ${interpolate(t, [0, 1], [100, 0])}% 0 0)` };
};

const wipeOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { clipPath: `inset(0 0 0 ${interpolate(t, [0, 1], [0, 100])}%)` };
};

const popIn: PresetFn = ({ frame, fps, inFrames }) => {
  const t = spring({ frame, fps, config: { damping: 10 }, durationInFrames: inFrames });
  return {
    opacity: softInOpacity(Math.min(1, t)),
    transform: `scale(${interpolate(t, [0, 1], [0.72, 1])})`,
  };
};

const popOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity: 1 - t, transform: `scale(${interpolate(t, [0, 1], [1, 0.55])})` };
};

const bounceIn: PresetFn = ({ frame, fps, inFrames }) => {
  const t = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 120 },
    durationInFrames: inFrames,
  });
  return {
    opacity: softInOpacity(Math.min(1, t * 1.1)),
    transform: `translateY(${interpolate(t, [0, 1], [60, 0])}px) scale(${interpolate(t, [0, 1], [0.9, 1])})`,
  };
};

const bounceOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: 1 - t,
    transform: `translateY(${interpolate(t, [0, 1], [0, 50])}px) scale(${interpolate(t, [0, 1], [1, 0.85])})`,
  };
};

const spinIn: PresetFn = ({ frame, inFrames }) => {
  const t = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return {
    opacity: softInOpacity(t),
    transform: `rotate(${interpolate(t, [0, 1], [-90, 0])}deg) scale(${interpolate(t, [0, 1], [0.7, 1])})`,
  };
};

const spinOut: PresetFn = ({ frame, durationInFrames, outFrames }) => {
  const t = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: 1 - t,
    transform: `rotate(${interpolate(t, [0, 1], [0, 90])}deg) scale(${interpolate(t, [0, 1], [1, 0.7])})`,
  };
};

const slideBounceIn: PresetFn = ({ frame, fps, inFrames }) => {
  const t = spring({
    frame,
    fps,
    config: { damping: 9, stiffness: 100 },
    durationInFrames: inFrames,
  });
  return {
    opacity: softInOpacity(Math.min(1, t * 1.15)),
    transform: `translateX(${interpolate(t, [0, 1], [100, 0])}px)`,
  };
};

const slideBounceOut: PresetFn = ({ frame, durationInFrames, outFrames, fps }) => {
  const local = frame - (durationInFrames - outFrames);
  const t = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 11, stiffness: 90 },
    durationInFrames: outFrames,
  });
  return {
    opacity: 1 - Math.min(1, t),
    transform: `translateX(${interpolate(Math.min(1, t), [0, 1], [0, -110])}px)`,
  };
};

const parallaxPanIn: PresetFn = ({ frame, inFrames }) => ({
  opacity: softInOpacity(
    interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  ),
});

const parallaxPanOut: PresetFn = ({ frame, durationInFrames, outFrames }) => ({
  opacity: interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
});

/** In-phase presets (keyed by schema animationPreset). */
export const IN_PRESETS: Record<AnimationPreset, PresetFn | null> = {
  none: null,
  fade: fadeIn,
  float: floatIn,
  zoom_in: zoomIn,
  zoom_out: null,
  ken_burns_in: kenBurnsIn,
  ken_burns_out: null,
  parallax_pan_in: parallaxPanIn,
  parallax_pan_out: null,
  drop: dropIn,
  slide: slideIn,
  wipe: wipeIn,
  pop: popIn,
  bounce: bounceIn,
  spin: spinIn,
  slide_bounce: slideBounceIn,
};

/** Out-phase presets — every selectable Out id from the Animations panel. */
export const OUT_PRESETS: Record<AnimationPreset, PresetFn | null> = {
  none: null,
  fade: fadeOut,
  float: floatOut,
  zoom_in: null,
  zoom_out: zoomOut,
  ken_burns_in: null,
  ken_burns_out: kenBurnsOut,
  parallax_pan_in: null,
  parallax_pan_out: parallaxPanOut,
  drop: dropOut,
  slide: slideOut,
  wipe: wipeOut,
  pop: popOut,
  bounce: bounceOut,
  spin: spinOut,
  slide_bounce: slideBounceOut,
};

export function applyLoopStyle(
  base: AnimatedStyle,
  preset: LoopPreset,
  frame: number,
  fps: number,
): AnimatedStyle {
  if (preset === "none") return base;
  if (preset === "pulse") {
    const s = 1 + 0.035 * Math.sin((frame / fps) * Math.PI * 2);
    return {
      ...base,
      transform: `${base.transform === "none" ? "" : base.transform} scale(${s})`.trim(),
    };
  }
  if (preset === "float") {
    const y = Math.sin((frame / fps) * Math.PI * 2) * 8;
    return {
      ...base,
      transform: `${base.transform === "none" ? "" : base.transform} translateY(${y}px)`.trim(),
    };
  }
  if (preset === "ken_burns") {
    const period = fps * 8;
    const t = (frame % period) / period;
    const scale = interpolate(t, [0, 1], [1, 1.08]);
    return {
      ...base,
      transform: `${base.transform === "none" ? "" : base.transform} scale(${scale})`.trim(),
    };
  }
  // Parallax pan motion is rendered in ParallaxPanClip (dual-layer).
  if (preset === "parallax_pan") {
    return base;
  }
  return base;
}
