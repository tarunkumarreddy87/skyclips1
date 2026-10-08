export interface ClipVisualEffects {
  filterId?: string;
  strength?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  effectId?: string;
  effectStrength?: number;
}

import filterCatalog from "./visual-filters.json";
export const VIDEO_FILTERS = filterCatalog;

export const VIDEO_EFFECTS = [
  { id: "none", name: "None" }, { id: "vignette", name: "Vignette" },
  { id: "handheld", name: "Handheld" }, { id: "pulse", name: "Pulse Zoom" },
  { id: "soft-focus", name: "Soft Focus" }, { id: "scanlines", name: "Scanlines" },
  { id: "flicker", name: "Film Flicker" }, { id: "chromatic", name: "Chromatic" },
] as const;

export function clipVisualFilter(effects?: ClipVisualEffects): string {
  if (!effects) return "none";
  const filter = VIDEO_FILTERS.find(f => f.id === effects.filterId) ?? VIDEO_FILTERS[0];
  const s = Math.max(0, Math.min(1, effects.strength ?? 1));
  const blend = (v: number) => 1 + (v - 1) * s;
  return `brightness(${blend(filter.brightness) * (effects.brightness ?? 1)}) contrast(${blend(filter.contrast) * (effects.contrast ?? 1)}) saturate(${blend(filter.saturation) * (effects.saturation ?? 1)}) sepia(${filter.sepia * s}) hue-rotate(${filter.hue * s}deg)`;
}
