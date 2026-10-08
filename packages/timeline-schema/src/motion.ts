/**
 * Element transform / animation / transition enums — mirror of timeline.v1.json (ADR 0007).
 * Only FFmpeg-implementable presets. Phase 5 owns filter mapping; do not add UI presets outside this set.
 */

export type AnimationPreset =
  | "none"
  | "fade"
  | "float"
  | "zoom_in"
  | "zoom_out"
  | "ken_burns_in"
  | "ken_burns_out"
  | "parallax_pan_in"
  | "parallax_pan_out"
  | "drop"
  | "slide"
  | "wipe"
  | "pop"
  | "bounce"
  | "spin"
  | "slide_bounce";

export type LoopPreset = "none" | "pulse" | "ken_burns" | "float" | "parallax_pan";

export interface ParallaxPanParams {
  direction?: "left-right" | "right-left" | "top-bottom" | "bottom-top";
  scale?: number;
  foreground_speed?: number;
  background_speed?: number;
}

/** Legacy HANUMAN names + native FFmpeg xfade transition names. */
export type ManifestTransitionType =
  | "cut"
  | "fade"
  | "slide"
  | "zoom"
  | "slide-pan"
  | "film-burn"
  | "glitch"
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  | "circleopen"
  | "circleclose"
  | "dissolve"
  | "pixelize";

export interface ElementTransform {
  /** Percent of frame width (0–100). Default 50 = centered. */
  x?: number;
  /** Percent of frame height (0–100). Default 50 = centered. */
  y?: number;
  scaleX?: number;
  scaleY?: number;
  /** Degrees clockwise. */
  rotation?: number;
  zIndex?: number;
}

export interface AnimationEdge {
  preset: AnimationPreset;
  /** Absolute-timeline effect length in seconds (schema). Editor UI may use ms. */
  duration_sec?: number;
}

export interface ElementAnimation {
  in?: AnimationEdge;
  out?: AnimationEdge;
  loop?: { preset: LoopPreset; params?: ParallaxPanParams };
}

/** Planned FFmpeg mapping (Phase 5). Documented here so Phase 3 UI cannot invent orphan presets. */
export const ANIMATION_PRESET_FFMPEG_HINT: Record<AnimationPreset, string> = {
  none: "identity",
  fade: "fade=t=in|out",
  float: "overlay x/y expr + mild opacity",
  zoom_in: "zoompan zoom='…'",
  zoom_out: "zoompan zoom='…'",
  ken_burns_in: "zoompan z/x/y over clip",
  ken_burns_out: "zoompan z/x/y over clip",
  parallax_pan_in: "Native translate",
  parallax_pan_out: "Native translate + fade",
  drop: "overlay y expr + fade",
  slide: "overlay x expr",
  wipe: "wipeleft/wiperight style crop/enable",
  pop: "scale expr + fade",
  bounce: "overlay y expr (easing)",
  spin: "rotate=a='…'",
  slide_bounce: "overlay x expr + bounce",
};

export const LOOP_PRESET_FFMPEG_HINT: Record<LoopPreset, string> = {
  none: "identity",
  pulse: "scale expr oscillating",
  ken_burns: "zoompan continuous",
  float: "overlay y expr oscillating",
  parallax_pan: "Native parallax pan",
};

export const DEFAULT_ANIMATION_DURATION_SEC = 0.6;

export const IDENTITY_TRANSFORM: Required<ElementTransform> = {
  x: 50,
  y: 50,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  zIndex: 0,
};
