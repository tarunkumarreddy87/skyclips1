import type { TransitionType } from "./types";

export interface TransitionPresetMeta {
  id: TransitionType;
  label: string;
  /** Short blurb for the panel */
  blurb: string;
  /** native engine / legacy filter id (also used by FFmpeg fallback when needed) */
  engineFilterId?: string;
}

/** All types allowed by timeline.v1 + editor (ADR 0007). native engine exports non-cuts. */
export const TRANSITION_PRESETS: TransitionPresetMeta[] = [
  { id: "cut", label: "Cut", blurb: "Hard cut — no blend" },
  { id: "fade", label: "Fade", blurb: "Crossfade", engineFilterId: "fade" },
  { id: "dissolve", label: "Dissolve", blurb: "Soft dissolve", engineFilterId: "dissolve" },
  { id: "wipeleft", label: "Wipe Left", blurb: "Wipe ←", engineFilterId: "wipeleft" },
  { id: "wiperight", label: "Wipe Right", blurb: "Wipe →", engineFilterId: "wiperight" },
  { id: "wipeup", label: "Wipe Up", blurb: "Wipe ↑", engineFilterId: "wipeup" },
  { id: "wipedown", label: "Wipe Down", blurb: "Wipe ↓", engineFilterId: "wipedown" },
  { id: "slideleft", label: "Slide Left", blurb: "Slide ←", engineFilterId: "slideleft" },
  { id: "slideright", label: "Slide Right", blurb: "Slide →", engineFilterId: "slideright" },
  { id: "slideup", label: "Slide Up", blurb: "Slide ↑", engineFilterId: "slideup" },
  { id: "slidedown", label: "Slide Down", blurb: "Slide ↓", engineFilterId: "slidedown" },
  { id: "slide", label: "Slide", blurb: "Legacy slide", engineFilterId: "slideright" },
  { id: "slide-pan", label: "Slide Pan", blurb: "Smooth pan", engineFilterId: "smoothleft" },
  { id: "zoom", label: "Zoom", blurb: "Zoom through", engineFilterId: "zoomin" },
  { id: "circleopen", label: "Circle Open", blurb: "Iris open", engineFilterId: "circleopen" },
  { id: "circleclose", label: "Circle Close", blurb: "Iris close", engineFilterId: "circleclose" },
  { id: "pixelize", label: "Pixelize", blurb: "Pixel morph", engineFilterId: "pixelize" },
  { id: "film-burn", label: "Film Burn", blurb: "Warm burn" },
  { id: "glitch", label: "Glitch", blurb: "Digital glitch" },
];

export const DEFAULT_TRANSITION_DURATION_MS = 500;
