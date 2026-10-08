/** Subset of packages/timeline-schema schema/timeline.v1.json (ADR 0007). */
import type { CaptionStyleId, GraphicObject } from "@hanuman/shared-types";

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
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  zIndex?: number;
}

export interface AnimationEdge {
  preset: AnimationPreset;
  duration_sec?: number;
}

export interface ElementAnimation {
  in?: AnimationEdge;
  out?: AnimationEdge;
  loop?: { preset: LoopPreset; params?: ParallaxPanParams };
}

export interface TimelineManifestV1 {
  version: "1";
  metadata: {
    project_id: string;
    run_id: string;
    format_mode: "documentary" | "listicle";
    resolution: { width: number; height: number };
    fps: number;
    duration_sec: number;
  };
  tracks: {
    video: TimelineVideoClip[];
    audio: TimelineAudioClip[];
    captions: TimelineCaptionClip[];
    broll?: TimelineBrollClip[];
    music?: TimelineMusicClip[];
  };
  transitions?: TimelineTransition[];
  overlays?: TimelineOverlay[];
  graphics?: GraphicObject[];
  settings?: {
    captions_enabled?: boolean;
    caption_style?: CaptionStyleId;
    music_volume?: number;
    narration_volume?: number;
    sfx_volume?: number;
    theme_id?: "crime" | "history" | "modern" | "minimalist" | "standard";
    /** Original footage audio bus (0–1). */
    clip_audio_volume?: number;
    background_color?: string;
    background_image?: string;
    overlay_drop_shadow?: boolean;
  };
}

export interface TimelineTransition {
  id: string;
  after_clip_id: string;
  type: ManifestTransitionType | string;
  duration_sec: number;
  enabled?: boolean;
  sfx_muted?: boolean;
}

export interface TimelineOverlaySlot {
  text?: string;
  value?: number;
  color?: string;
  label?: string;
}

export interface TimelineOverlay {
  scene?: import("@hanuman/shared-types").MotionScene;
  id: string;
  type: string;
  text?: string;
  title?: string;
  subtitle?: string;
  slots?: TimelineOverlaySlot[];
  image_refs?: string[];
  theme_id?: string;
  start_sec: number;
  duration_sec: number;
  transform?: ElementTransform;
  animation?: ElementAnimation;
  style?: {
    font_size_px?: number;
    color?: string;
    font_weight?: string;
    alignment?: "left" | "center" | "right";
    font_family?: string;
    box_width_pct?: number;
  };
}

export interface TimelineVideoClip {
  motion_template?: import("@hanuman/shared-types").EditorialARollTemplate;
  three_scene?: import("@hanuman/shared-types").ThreeScene;
  visual_effects?: import("@hanuman/shared-types").ClipVisualEffects;
  id: string;
  scene_id: string;
  type: "image" | "video";
  src: string;
  start_sec: number;
  duration_sec: number;
  source_start_sec?: number;
  fit?: "cover" | "contain";
  muted?: boolean;
  transform?: ElementTransform;
  animation?: ElementAnimation;
}

export interface TimelineBrollClip {
  three_scene?: import("@hanuman/shared-types").ThreeScene;
  visual_effects?: import("@hanuman/shared-types").ClipVisualEffects;
  id: string;
  scene_id: string;
  type: "image" | "video";
  src: string;
  start_sec: number;
  duration_sec: number;
  source_start_sec?: number;
  fit?: "cover" | "contain";
  muted?: boolean;
  label?: string;
  transform?: ElementTransform;
  animation?: ElementAnimation;
}

export interface TimelineAudioClip {
  id: string;
  type: "narration";
  src: string;
  start_sec: number;
  duration_sec: number;
  source_start_sec?: number;
  volume?: number;
  fade_in_sec?: number;
  fade_out_sec?: number;
}

export interface TimelineMusicClip {
  id: string;
  type: "music";
  src: string;
  start_sec: number;
  duration_sec: number;
  source_start_sec?: number;
  volume?: number;
  fade_in_sec?: number;
  fade_out_sec?: number;
  mood?: string;
  label?: string;
}

export interface TimelineCaptionClip {
  id: string;
  section_id: string;
  text: string;
  start_sec: number;
  duration_sec: number;
  transform?: ElementTransform;
  animation?: ElementAnimation;
  style?: {
    font_size_px?: number;
    color?: string;
    font_weight?: string;
    box_width_pct?: number;
  };
  words?: Array<{ text: string; start_sec: number; duration_sec: number }>;
}

export interface TimelineApiResponse {
  artifactId: string;
  manifest: TimelineManifestV1;
  mediaUrls: Record<string, string>;
}
