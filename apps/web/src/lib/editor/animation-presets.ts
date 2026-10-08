import type { AnimationPreset, LoopPreset } from "./types";

export type AnimationTab = "in" | "out" | "loop" | "zoom" | "all";

export interface AnimationPresetMeta {
  id: AnimationPreset;
  label: string;
  /** Which tabs show this preset */
  tabs: Array<Exclude<AnimationTab, "all">>;
}

export interface LoopPresetMeta {
  id: LoopPreset;
  label: string;
}

/** native engine-rendered In/Out presets (ADR 0007) — UI labels match product card art. */
export const IN_OUT_PRESETS: AnimationPresetMeta[] = [
  { id: "none", label: "None", tabs: ["in", "out", "zoom"] },
  { id: "fade", label: "Fade", tabs: ["in", "out"] },
  { id: "zoom_in", label: "Zoom In", tabs: ["in", "zoom"] },
  { id: "zoom_out", label: "Zoom Out", tabs: ["out", "zoom"] },
  { id: "ken_burns_in", label: "Ken Burns In", tabs: ["in", "zoom"] },
  { id: "ken_burns_out", label: "Ken Burns Out", tabs: ["out", "zoom"] },
  { id: "parallax_pan_in", label: "Parallax pan", tabs: ["in", "zoom"] },
  { id: "parallax_pan_out", label: "Parallax pan out", tabs: ["out", "zoom"] },
  { id: "spin", label: "Spin", tabs: ["in", "out"] },
  { id: "pop", label: "Pop", tabs: ["in", "out"] },
  { id: "wipe", label: "Wipe", tabs: ["in", "out"] },
  // CSS preview is softer; native engine exports the full motion (≈ badge in panel).
  { id: "float", label: "Float", tabs: ["in", "out"] },
  { id: "drop", label: "Drop", tabs: ["in", "out"] },
  { id: "slide", label: "Slide", tabs: ["in", "out"] },
  { id: "bounce", label: "Bounce", tabs: ["in", "out"] },
  { id: "slide_bounce", label: "Slide bounce", tabs: ["in", "out"] },
];

export const LOOP_PRESETS: LoopPresetMeta[] = [
  { id: "none", label: "None" },
  { id: "pulse", label: "Pulse" },
  { id: "ken_burns", label: "Ken Burns" },
  { id: "parallax_pan", label: "Parallax pan" },
  { id: "float", label: "Float" },
];

export const DEFAULT_ANIMATION_DURATION_MS = 600;

export function presetsForTab(tab: Exclude<AnimationTab, "all" | "loop">): AnimationPresetMeta[] {
  return IN_OUT_PRESETS.filter((p) => p.tabs.includes(tab));
}
