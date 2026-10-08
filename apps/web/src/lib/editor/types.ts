import type { CaptionStyleId, GraphicObject } from "@hanuman/shared-types";

export type EditorProjectStatus = "editing" | "rendering" | "completed" | "failed";
export type TrackType =
  | "video"
  | "broll"
  | "narration"
  | "music"
  | "sfx"
  | "text"
  | "captions"
  | "animation";

export type MediaType = "image" | "video" | "audio";
export type AssetSourceType = "generated" | "stock" | "licensed" | "local" | "url";
export type FitMode = "cover" | "contain" | "fill";
export type TransitionType =
  | "cut"
  | "zoom"
  | "slide-pan"
  | "film-burn"
  | "glitch"
  | "fade"
  | "slide"
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

/** Editor-facing animation presets (mirror timeline.v1 / ADR 0007). */
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

export interface ElementTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  zIndex: number;
}

export interface ElementAnimation {
  in?: { preset: AnimationPreset; durationMs: number };
  out?: { preset: AnimationPreset; durationMs: number };
  loop?: { preset: LoopPreset; params?: ParallaxPanParams };
}

export type LeftTool = "media" | "text" | "audio" | "animations" | "transitions" | "templates" | "files" | "history" | "effects";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export interface EditorProject {
  id: string;
  title: string;
  format: "documentary" | "listicle";
  durationMs: number;
  status: EditorProjectStatus;
  prompt: string;
  model: string;
  language: string;
  voice: string;
  brandProfile: string;
  createdAt: string;
  fps: number;
}

export interface TimelineSettings {
  zoom: number;
  snappingEnabled: boolean;
  showTransitions: boolean;
  captionsEnabled: boolean;
  /** Project-level caption style shared by preview and cloud export. */
  captionStyle: CaptionStyleId;
  backgroundColor: string;
  backgroundImage: string | null;
  overlayDropShadow: boolean;
  narrationVolume: number;
  musicVolume: number;
  sfxVolume: number;
  clipAudioVolume: number;
  /** Preview master mute — silences all mix buses in the editor only. */
  previewMuted?: boolean;
  /** Monitor gain only; not serialized into the render manifest. */
  previewVolume?: number;
  /** Active visual theme (maps from brand_profile_id / settings.theme_id). */
  themeId?: "crime" | "history" | "modern" | "minimalist" | "standard";
  /**
   * Optional lane display order (TrackType). When set, timeline rows follow this
   * instead of the default TRACK_DISPLAY_ORDER.
   */
  trackOrder?: TrackType[];
}

export interface TimelineItemBase {
  id: string;
  type: TrackType;
  startMs: number;
  endMs: number;
  label: string;
  hidden: boolean;
  selected?: boolean;
}

export interface ClipItem extends TimelineItemBase {
  threeScene?: import("@hanuman/shared-types").ThreeScene;
  motionTemplate?: import("@hanuman/shared-types").EditorialARollTemplate;
  visualEffects?: import("@hanuman/shared-types").ClipVisualEffects;
  type: "video" | "broll";
  mediaType: MediaType;
  assetId: string;
  fitMode: FitMode;
  muted: boolean;
  thumbnailUrl?: string;
  /** In-point into the source media (ms). Left-trim advances this. */
  sourceStartMs?: number;
  transform?: ElementTransform;
  animation?: ElementAnimation;
}

export interface AudioItem extends TimelineItemBase {
  type: "narration" | "music" | "sfx";
  assetId: string;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** In-point into the source media (ms). Left-trim advances this. */
  sourceStartMs?: number;
}

export interface TextItem extends TimelineItemBase {
  type: "text" | "captions";
  text: string;
  stylePreset: string;
  /** Pipeline section key for timeline grouping (from caption.section_id). */
  sectionId?: string;
  fontSize: number;
  color: string;
  fontWeight: string;
  alignment: "left" | "center" | "right";
  /** CSS font-family id or stack (see text-fonts.ts). */
  fontFamily?: string;
  /**
   * Text box width as % of the preview frame (Creativly-style).
   * East/west handles adjust this so copy reflows horizontally instead of scaling type.
   */
  boxWidthPct?: number;
  position: { x: number; y: number };
  transform?: ElementTransform;
  animation?: ElementAnimation;
  /** Optional word clocks (absolute seconds) for karaoke / boxed styles. */
  words?: Array<{ text: string; startSec: number; durationSec: number }>;
}

export interface MotionSlot {
  text?: string;
  value?: number;
  color?: string;
  label?: string;
}

export interface AnimationItem extends TimelineItemBase {
  textStyle?: { fontSize: number; color: string; fontFamily: string; fontWeight: string; alignment: "left" | "center" | "right" };
  scene?: import("@hanuman/shared-types").MotionScene;
  type: "animation";
  preset: string;
  intensity: number;
  position: { x: number; y: number };
  transform?: ElementTransform;
  animation?: ElementAnimation;
  /** Structured object payload; timing/transform are owned by the timeline item. */
  graphic?: GraphicObject;
  /**
   * Chapter / lower-third box width as % of frame (same Creativly model as freeform text).
   */
  boxWidthPct?: number;
  /** Motion-graphic template fields (Phase 1). */
  title?: string;
  subtitle?: string;
  slots?: MotionSlot[];
  imageRefs?: string[];
  themeId?: string;
}

export type TimelineItem = ClipItem | AudioItem | TextItem | AnimationItem;

export interface Track {
  id: string;
  type: TrackType;
  label: string;
  items: TimelineItem[];
  locked: boolean;
  hidden: boolean;
}

export interface TransitionItem {
  id: string;
  afterItemId: string;
  transitionType: TransitionType;
  durationMs: number;
  enabled: boolean;
  sfxMuted?: boolean;
}

export interface Timeline {
  id: string;
  durationMs: number;
  fps: number;
  settings: TimelineSettings;
  tracks: Track[];
  transitions: TransitionItem[];
}

export interface Asset {
  id: string;
  sourceType: AssetSourceType;
  mediaType: MediaType;
  label: string;
  url: string;
  thumbnailUrl: string;
  durationMs?: number;
  metadata?: Record<string, string>;
}

export interface HistorySnapshot {
  id: string;
  label: string;
  createdAt: string;
  actionType: string;
  isOriginal?: boolean;
}

export interface EditorState {
  project: EditorProject;
  timeline: Timeline;
  assets: Asset[];
  history: HistorySnapshot[];
}
