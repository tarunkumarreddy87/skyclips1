import type { TransitionType } from "./types";

export interface TransitionPresetMeta {
  id: TransitionType;
  label: string;
  /** Short blurb for the panel */
  blurb: string;
  /** Remotion / legacy filter id (also used by FFmpeg fallback when needed) */
  remotionId?: string;
}

/** All types allowed by timeline.v1 + editor (ADR 0007). Remotion exports non-cuts. */
export const TRANSITION_PRESETS: TransitionPresetMeta[] = [
  { id: "cut", label: "Cut", blurb: "Hard cut — no blend" },
  { id: "fade", label: "Fade", blurb: "Crossfade · Remotion", remotionId: "fade" },
  { id: "dissolve", label: "Dissolve", blurb: "Soft dissolve · Remotion", remotionId: "dissolve" },
  { id: "wipeleft", label: "Wipe Left", blurb: "Wipe ← · Remotion", remotionId: "wipeleft" },
  { id: "wiperight", label: "Wipe Right", blurb: "Wipe → · Remotion", remotionId: "wiperight" },
  { id: "wipeup", label: "Wipe Up", blurb: "Wipe ↑ · Remotion", remotionId: "wipeup" },
  { id: "wipedown", label: "Wipe Down", blurb: "Wipe ↓ · Remotion", remotionId: "wipedown" },
  { id: "slideleft", label: "Slide Left", blurb: "Slide ← · Remotion", remotionId: "slideleft" },
  { id: "slideright", label: "Slide Right", blurb: "Slide → · Remotion", remotionId: "slideright" },
  { id: "slideup", label: "Slide Up", blurb: "Slide ↑ · Remotion", remotionId: "slideup" },
  { id: "slidedown", label: "Slide Down", blurb: "Slide ↓ · Remotion", remotionId: "slidedown" },
  { id: "slide", label: "Slide", blurb: "Legacy slide · Remotion", remotionId: "slideright" },
  { id: "slide-pan", label: "Slide Pan", blurb: "Smooth pan · Remotion (CSS preview softer)", remotionId: "smoothleft" },
  { id: "zoom", label: "Zoom", blurb: "Zoom through · Remotion (CSS preview softer)", remotionId: "zoomin" },
  { id: "circleopen", label: "Circle Open", blurb: "Iris open · Remotion", remotionId: "circleopen" },
  { id: "circleclose", label: "Circle Close", blurb: "Iris close · Remotion", remotionId: "circleclose" },
  { id: "pixelize", label: "Pixelize", blurb: "Pixel morph · Remotion (CSS preview softer)", remotionId: "pixelize" },
  { id: "film-burn", label: "Film Burn", blurb: "Warm burn · Remotion (CSS preview softer)" },
  { id: "glitch", label: "Glitch", blurb: "Digital glitch · Remotion (CSS preview softer)" },
];

export const DEFAULT_TRANSITION_DURATION_MS = 500;
