/**
 * Motion-graphics template catalog — shared between web editor, native render,
 * and the backend AI auto-trigger. Adding a template here is the single source of
 * truth for its id, category, and manifest type.
 */

export type MotionTemplateCategory =
  | "intro-outro"
  | "cinematic-text"
  | "media-image"
  | "charts-data"
  | "content-animation";

/** Structured renderer component ids shared by AI planning and renderer adapters. */
export type MotionComponentId =
  | "kinetic_title" | "data_chart" | "archive" | "newspaper" | "comparison" | "quote"
  | "product_launch" | "lower_third" | "timeline" | "statistics" | "map" | "infographic"
  | "image_reveal" | "logo_reveal" | "fullscreen_text" | "split_screen";

/** All template IDs. Existing chrome + Phase-1 graphic templates. */
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
  // Phase 1 shipped motion graphics
  "vertical-bar-chart",
  "line-chart",
  "before-after-split",
  "news-highlight",
  "doc-callout",
  "highlight-quote",
  "product-launch-fullscreen",
  "editorial-title",
  "editorial-data",
  "editorial-archive",
  "editorial-newspaper",
] as const;

/** Full-frame 16:9 A-roll scenes, never timeline overlays. */
export const EDITORIAL_A_ROLL_IDS = [
  "editorial-title", "editorial-data", "editorial-archive", "editorial-newspaper",
  "vertical-bar-chart", "line-chart", "before-after-split", "news-highlight",
  "doc-callout", "highlight-quote", "product-launch-fullscreen",
] as const;
export type EditorialARollId = (typeof EDITORIAL_A_ROLL_IDS)[number];
export const DOCUMENTARY_LAYOUTS = ["title", "definition", "line", "bars", "annotated-chart", "comparison", "timeline", "article", "profile", "connections", "closing"] as const;
export type DocumentaryLayout = (typeof DOCUMENTARY_LAYOUTS)[number];
export interface EditorialARollTemplate {
  id: EditorialARollId;
  /** Optional during gradual migration; absent means use the native documentary template. */
  motion_component?: MotionComponentId;
  title: string;
  highlight?: string;
  motion_intensity?: "subtle" | "cinematic";
  subtitle?: string;
  eyebrow?: string;
  source_label?: string;
  /** Scene-specific composition using the documentary reference's visual grammar. */
  documentary_layout?: DocumentaryLayout;
  elements?: ReadonlyArray<{ label: string; detail?: string }>;
  links?: ReadonlyArray<{ from: number; to: number }>;
  html_template?: import("./html-template").HtmlTemplate;
  layer_edits?: Record<string, import("./html-template").TemplateLayerEdit>;
  /** User-authored title typography; sizes are in 1920px composition pixels. */
  title_style?: {
    font_family?: string;
    font_size?: number;
    font_weight?: number;
    color?: string;
    alignment?: "left" | "center" | "right";
  };
  /** Optional frame-synchronized number or clock (clock values are seconds). */
  counter?: { from: number; to: number; format: "number" | "clock"; prefix?: string; suffix?: string };
  /** Chart values must come from cited research, never demo defaults. */
  values?: ReadonlyArray<{ label: string; value: number }>;
}
export function isEditorialARollId(id: string): id is EditorialARollId {
  return (EDITORIAL_A_ROLL_IDS as readonly string[]).includes(id);
}

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

export const MOTION_TEMPLATE_CATALOG: MotionTemplateMeta[] = [];

/** Manifest overlay types that render as Phase-1 motion graphics (not text chrome). */
export const MOTION_GRAPHIC_MANIFEST_TYPES = [
  "vertical_bar_chart",
  "line_chart",
  "before_after_split",
  "news_highlight",
  "doc_callout",
  "highlight_quote",
  "product_launch_fullscreen",
] as const;

export type MotionGraphicManifestType = (typeof MOTION_GRAPHIC_MANIFEST_TYPES)[number];

export function isMotionGraphicManifestType(type: string): type is MotionGraphicManifestType {
  return (MOTION_GRAPHIC_MANIFEST_TYPES as readonly string[]).includes(type);
}

export function getTemplateMeta(id: string): MotionTemplateMeta | undefined {
  return MOTION_TEMPLATE_CATALOG.find((t) => t.id === id);
}

export function getTemplateByManifestType(manifestType: string): MotionTemplateMeta | undefined {
  return MOTION_TEMPLATE_CATALOG.find((t) => t.manifestType === manifestType && t.shipped);
}

export function templatesByCategory(category: MotionTemplateCategory): MotionTemplateMeta[] {
  return MOTION_TEMPLATE_CATALOG.filter((t) => t.category === category);
}

export function shippedTemplates(): MotionTemplateMeta[] {
  return MOTION_TEMPLATE_CATALOG.filter((t) => t.shipped);
}

/** Shipped Phase-1 graphic templates (excludes text chrome / clip-motion helpers). */
export function shippedMotionGraphicTemplates(): MotionTemplateMeta[] {
  return MOTION_TEMPLATE_CATALOG.filter(
    (t) => t.shipped && isMotionGraphicManifestType(t.manifestType),
  );
}

/** Default still-image motion: dual-layer parallax pan. */
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

/** Default demo slots for chart / split templates when none authored. */
export function defaultSlotsForTemplate(id: TemplateId): Array<{
  text?: string;
  value?: number;
  color?: string;
  label?: string;
}> {
  switch (id) {
    case "vertical-bar-chart":
      return [
        // No per-bar colours: renderers derive a theme-coherent ramp.
        { label: "Jan", value: 42 },
        { label: "Feb", value: 68 },
        { label: "Mar", value: 55 },
        { label: "Apr", value: 88 },
        { label: "May", value: 72 },
      ];
    case "line-chart":
      return [
        { label: "W1", value: 20 },
        { label: "W2", value: 35 },
        { label: "W3", value: 28 },
        { label: "W4", value: 52 },
        { label: "W5", value: 70 },
        { label: "W6", value: 64 },
      ];
    case "before-after-split":
      return [
        { text: "Before", label: "Before" },
        { text: "After", label: "After" },
      ];
    case "news-highlight":
      return [{ text: "Breaking" }];
    case "doc-callout":
      return [{ text: "Key fact" }];
    case "highlight-quote":
      return [];
    case "product-launch-fullscreen":
      return [
        { label: "Focus", text: "Hero reveal", color: "#35f0a6" },
        { label: "Lighting", text: "Premium sweep", color: "#7dd3fc" },
        { label: "Motion", text: "Layered build", color: "#facc15" },
        { label: "Captions", text: "Readable karaoke", color: "#fb7185" },
      ];
    default:
      return [];
  }
}
