/**
 * Preview vs Remotion export honesty (ADR 0009).
 * Editor preview is CSS-approximate; Remotion owns motion-rich MP4s
 * (FFmpeg remains a silent fallback for hard cuts / failures — not UI-facing).
 */

/** In/Out presets where CSS preview is a fair proxy for Remotion. */
export const PREVIEW_STRONG_ANIMATION = new Set([
  "none",
  "fade",
  "zoom_in",
  "zoom_out",
  "ken_burns_in",
  "ken_burns_out",
  "spin",
  "pop",
  "wipe",
]);

/**
 * CSS preview is softer / simpler than the Remotion MP4.
 * Final export still uses the full Remotion preset (not a reduced FFmpeg stand-in).
 */
export const PREVIEW_APPROX_ANIMATION = new Set([
  "float",
  "drop",
  "slide",
  "bounce",
  "slide_bounce",
  "parallax_pan_in",
  "parallax_pan_out",
]);

/** CSS transition scrub differs most from Remotion TransitionSeries. */
export const PREVIEW_APPROX_TRANSITIONS = new Set([
  "film-burn",
  "glitch",
  "pixelize",
  "zoom",
  "slide-pan",
]);

/** @deprecated Prefer PREVIEW_STRONG_ANIMATION — kept for call-site aliases. */
export const EXPORT_STRONG_ANIMATION = PREVIEW_STRONG_ANIMATION;
/** @deprecated Prefer PREVIEW_APPROX_ANIMATION */
export const EXPORT_APPROX_ANIMATION = PREVIEW_APPROX_ANIMATION;

/** How close CSS In/Out preview is to Remotion export. */
export function animationExportNote(preset: string): "strong" | "approx" | "none" {
  if (preset === "none") return "none";
  if (PREVIEW_STRONG_ANIMATION.has(preset)) return "strong";
  if (PREVIEW_APPROX_ANIMATION.has(preset)) return "approx";
  return "approx";
}

export function transitionPreviewNote(type: string): "exact" | "approx" | "none" {
  const key = type.trim().toLowerCase();
  if (!key || key === "cut") return "none";
  if (PREVIEW_APPROX_TRANSITIONS.has(key)) return "approx";
  return "exact";
}

export function motionPresetPreviewNote(preset: string | undefined): "exact" | "approx" | "none" {
  if (!preset) return "none";
  // Chapter/CTA chrome is shared with Remotion via overlay-chrome.ts; animation
  // timing is still CSS-approx but we no longer nag the honesty chip for chrome alone.
  if (preset === "subscribe-cta" || preset === "chapter-title" || preset === "lower-third") {
    return "exact";
  }
  return "none";
}
