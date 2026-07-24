/**
 * Motion-graphics template catalog — shared between web editor, Remotion render,
 * and the backend AI auto-trigger. Adding a template here is the single source of
 * truth for its id, category, and manifest type.
 */

export type MotionTemplateCategory =
  | "intro-outro"
  | "cinematic-text"
  | "media-image"
  | "charts-data"
  | "content-animation";

/** All template IDs. Existing 3 are kept for backward compat. */
export const MOTION_TEMPLATE_IDS = [
  "subscribe-cta",
  "chapter-title",
  "lower-third",
  "ken-burns-reveal",
  "parallax-pan",
  "photo-stack",
  "polaroid-frame",
  "image-carousel",
  "split-screen",
  "picture-in-picture",
] as const;

export type TemplateId = (typeof MOTION_TEMPLATE_IDS)[number];

export interface MotionTemplateMeta {
  id: TemplateId;
  label: string;
  category: MotionTemplateCategory;
  /** Short description shown in the panel + AI trigger prompt. */
  hint: string;
  /** Manifest overlay type string (stored in timeline.v1.json overlay.type). */
  manifestType: string;
  /** Whether this template needs image references (media templates). */
  needsImages: boolean;
  /** When true, template is selectable in editor / auto-trigger today. */
  shipped: boolean;
}

export const MOTION_TEMPLATE_CATALOG: MotionTemplateMeta[] = [
  {
    id: "subscribe-cta",
    label: "Subscribe CTA",
    category: "content-animation",
    hint: "End-screen subscribe badge with pulse animation",
    manifestType: "subscribe_cta",
    needsImages: false,
    shipped: true,
  },
  {
    id: "chapter-title",
    label: "Chapter title",
    category: "cinematic-text",
    hint: "Section header overlay, slides in from the left",
    manifestType: "chapter_title",
    needsImages: false,
    shipped: true,
  },
  {
    id: "lower-third",
    label: "Lower third",
    category: "cinematic-text",
    hint: "Broadcast-style name and title strip at the bottom",
    manifestType: "chapter_title",
    needsImages: false,
    shipped: true,
  },
  {
    id: "ken-burns-reveal",
    label: "Ken Burns reveal",
    category: "media-image",
    hint: "Slow zoom focus-pull on a hero still (clip animation)",
    manifestType: "ken_burns_reveal",
    needsImages: true,
    shipped: true,
  },
  {
    id: "parallax-pan",
    label: "Parallax pan",
    category: "media-image",
    hint: "Foreground and background layers pan at different speeds for cinematic depth",
    manifestType: "parallax_pan",
    needsImages: true,
    shipped: true,
  },
  {
    id: "photo-stack",
    label: "Photo stack",
    category: "media-image",
    hint: "Stacked photo reveal with slight rotation offsets",
    manifestType: "photo_stack",
    needsImages: true,
    shipped: false,
  },
  {
    id: "polaroid-frame",
    label: "Polaroid frame",
    category: "media-image",
    hint: "Polaroid-style photo frame with drop-in animation",
    manifestType: "polaroid_frame",
    needsImages: true,
    shipped: false,
  },
  {
    id: "image-carousel",
    label: "Image carousel",
    category: "media-image",
    hint: "Horizontal sliding image carousel with centre focus",
    manifestType: "image_carousel",
    needsImages: true,
    shipped: false,
  },
  {
    id: "split-screen",
    label: "Split screen",
    category: "media-image",
    hint: "Two-panel split screen for comparisons and dual content",
    manifestType: "split_screen",
    needsImages: true,
    shipped: false,
  },
  {
    id: "picture-in-picture",
    label: "Picture in picture",
    category: "media-image",
    hint: "PiP overlay layout for tutorials and video calls",
    manifestType: "picture_in_picture",
    needsImages: true,
    shipped: false,
  },
];

export function getTemplateMeta(id: string): MotionTemplateMeta | undefined {
  return MOTION_TEMPLATE_CATALOG.find((t) => t.id === id);
}

export function templatesByCategory(category: MotionTemplateCategory): MotionTemplateMeta[] {
  return MOTION_TEMPLATE_CATALOG.filter((t) => t.category === category);
}

export function shippedTemplates(): MotionTemplateMeta[] {
  return MOTION_TEMPLATE_CATALOG.filter((t) => t.shipped);
}

/** Default still-image motion: dual-layer parallax pan (Remotion). */
export function stillClipParallaxPanAnimation(durationSec: number): {
  in: { preset: string; duration_sec: number };
  loop: { preset: string; params: Record<string, number | string> };
} {
  const inDur = Math.min(1.2, Math.max(0.45, durationSec * 0.22));
  return {
    in: { preset: "parallax_pan_in", duration_sec: Math.round(inDur * 1000) / 1000 },
    loop: {
      preset: "parallax_pan",
      params: {
        direction: "left-right",
        scale: 1.2,
        foreground_speed: 1,
        background_speed: 0.45,
      },
    },
  };
}

export function stillClipKenBurnsAnimation(durationSec: number): {
  in: { preset: string; duration_sec: number };
  loop: { preset: string };
} {
  const inDur = Math.min(1.2, Math.max(0.45, durationSec * 0.22));
  return {
    in: { preset: "ken_burns_in", duration_sec: Math.round(inDur * 1000) / 1000 },
    loop: { preset: "ken_burns" },
  };
}
