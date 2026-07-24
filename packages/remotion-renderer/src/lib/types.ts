/** timeline.v1 subset typed for Remotion props (mirrors packages/timeline-schema). */

import type { ParallaxPanParams } from "./parallax-params";

export type { ParallaxDirection, ParallaxPanParams } from "./parallax-params";

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

export interface VideoClip {
  id: string;
  scene_id: string;
  type: "image" | "video";
  src: string;
  start_sec: number;
  duration_sec: number;
  source_start_sec?: number;
  fit?: "cover" | "contain";
  /** When true, preview clip media audio stays silent. */
  muted?: boolean;
  transform?: ElementTransform;
  animation?: ElementAnimation;
}

export interface BrollClip extends VideoClip {
  label?: string;
}

export interface AudioClip {
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

export interface CaptionClip {
  id: string;
  section_id: string;
  text: string;
  start_sec: number;
  duration_sec: number;
  transform?: ElementTransform;
  animation?: ElementAnimation;
  style?: { font_size_px?: number; color?: string; font_weight?: string; box_width_pct?: number };
  words?: Array<{ text: string; start_sec: number; duration_sec: number }>;
}

export interface MusicClip {
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
}

export type TransitionType =
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

export interface Transition {
  id: string;
  after_clip_id: string;
  type: TransitionType;
  duration_sec: number;
  enabled?: boolean;
  sfx_muted?: boolean;
}

export interface Overlay {
  id: string;
  type: "subscribe_cta" | "chapter_title" | "freeform_text";
  text?: string;
  start_sec: number;
  duration_sec: number;
  transform?: ElementTransform;
  animation?: ElementAnimation;
  /** Freeform title/card text styling (1080p px). */
  style?: {
    font_size_px?: number;
    color?: string;
    font_weight?: string;
    alignment?: "left" | "center" | "right";
    font_family?: string;
    box_width_pct?: number;
  };
}

export interface TimelineManifestV1 {
  version: "1";
  metadata: {
    project_id: string;
    run_id: string;
    format_mode: "documentary" | "listicle";
    resolution: { width: 1920; height: 1080 };
    fps: 30;
    duration_sec: number;
  };
  tracks: {
    video: VideoClip[];
    audio: AudioClip[];
    captions: CaptionClip[];
    broll?: BrollClip[];
    music?: MusicClip[];
  };
  transitions?: Transition[];
  overlays?: Overlay[];
  settings?: {
    captions_enabled?: boolean;
    caption_style?: "bold_static" | "karaoke" | "boxed_pill" | string;
    music_volume?: number;
    narration_volume?: number;
    sfx_volume?: number;
    theme_id?: string;
    /**
     * Preview-only A-roll / B-roll media audio bus (0–1).
     * Not burned into Remotion MP4 export mix.
     */
    clip_audio_volume?: number;
  };
}

export interface TimelineCompositionProps {
  manifest: TimelineManifestV1;
  /**
   * Editor preview: mute Remotion Audio so HTML audio transport stays SSOT
   * (drift correction / stutter fixes). Picture still uses Remotion.
   */
  muteAudio?: boolean;
  /**
   * Editor live preview: lay out clips on the absolute editor timeline clock
   * (matches the playhead / timeline lanes). Final export keeps TransitionSeries
   * compression via the default (`false`).
   */
  editorClock?: boolean;
  /**
   * Temporary A/B: skip themeGradeCssFilter (render-cost isolation).
   * Prefer env REMOTION_DISABLE_THEME_GRADE when driving CLI/Lambda.
   */
  disableThemeGrade?: boolean;
  /** Temporary A/B: skip CaptionTrack entirely. */
  disableCaptions?: boolean;
  /** Temporary A/B: strip TransitionSeries.Transition (hard cuts only). */
  disableTransitions?: boolean;
  /** Temporary A/B: force ParallaxPanClip off (use ApplyAnimation path). */
  disableParallax?: boolean;
  /** Temporary A/B: ApplyAnimation no-op (opacity 1, no transform/clipPath). */
  disableAnimations?: boolean;
}
