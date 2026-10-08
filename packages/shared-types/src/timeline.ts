import type { CaptionStyleId, CaptionWordTiming } from "./caption-style";

/** Engine-neutral authoring contract. Times are absolute seconds unless documented. */
export type AnimationPreset = "none" | "fade" | "float" | "zoom_in" | "zoom_out" | "ken_burns_in" | "ken_burns_out" | "parallax_pan_in" | "parallax_pan_out" | "drop" | "slide" | "wipe" | "pop" | "bounce" | "spin" | "slide_bounce";
export type LoopPreset = "none" | "pulse" | "ken_burns" | "float" | "parallax_pan";
export type ParallaxDirection = "left-right" | "right-left" | "top-bottom" | "bottom-top";
export interface ParallaxPanParams { direction?: ParallaxDirection; scale?: number; foreground_speed?: number; background_speed?: number }
export interface ElementTransform { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number; zIndex?: number }
export interface AnimationEdge { preset: AnimationPreset; duration_sec?: number }
export interface ElementAnimation { in?: AnimationEdge; out?: AnimationEdge; loop?: { preset: LoopPreset; params?: ParallaxPanParams } }
export interface VideoClip { three_scene?: import("./three-scene").ThreeScene; visual_effects?: import("./visual-effects").ClipVisualEffects; motion_template?: import("./motion-templates").EditorialARollTemplate; id: string; scene_id: string; type: "image" | "video"; src: string; start_sec: number; duration_sec: number; source_start_sec?: number; fit?: "cover" | "contain"; muted?: boolean; transform?: ElementTransform; animation?: ElementAnimation }
export interface BrollClip extends VideoClip { label?: string }
export interface AudioClip { id: string; type: "narration"; src: string; start_sec: number; duration_sec: number; source_start_sec?: number; volume?: number; fade_in_sec?: number; fade_out_sec?: number }
export interface MusicClip extends Omit<AudioClip, "type"> { type: "music"; mood?: string; label?: string }
export interface TextStyle { font_size_px?: number; color?: string; font_weight?: string; alignment?: "left" | "center" | "right"; font_family?: string; box_width_pct?: number }
export interface CaptionClip { id: string; section_id: string; text: string; start_sec: number; duration_sec: number; transform?: ElementTransform; animation?: ElementAnimation; style?: TextStyle; words?: CaptionWordTiming[] }
export type TransitionType = "cut" | "fade" | "slide" | "zoom" | "slide-pan" | "film-burn" | "glitch" | "wipeleft" | "wiperight" | "wipeup" | "wipedown" | "slideleft" | "slideright" | "slideup" | "slidedown" | "circleopen" | "circleclose" | "dissolve" | "pixelize";
export interface Transition { id: string; after_clip_id: string; type: TransitionType | string; duration_sec: number; enabled?: boolean; sfx_muted?: boolean }
export interface Overlay { scene?: import("./motion-scene").MotionScene; title?: string; subtitle?: string; slots?: Array<{text?: string; value?: number; color?: string; label?: string}>; image_refs?: string[]; theme_id?: string; id: string; type: string; text?: string; start_sec: number; duration_sec: number; transform?: ElementTransform; animation?: ElementAnimation; style?: TextStyle }

/** Time relative to the graphic's start; positions are percentages of the frame. */
export interface GraphicKeyframe { time_sec: number; x?: number; y?: number; scale?: number; rotation?: number; opacity?: number }
export interface GraphicObject {
  id: string;
  type: "frame" | "bar_chart" | "shape";
  start_sec: number;
  duration_sec: number;
  src?: string;
  text?: string;
  color?: string;
  width_pct?: number;
  height_pct?: number;
  shape?: "rectangle" | "circle";
  data?: Array<{ label: string; value: number }>;
  transform?: ElementTransform;
  animation?: ElementAnimation;
  keyframes?: GraphicKeyframe[];
}

export interface TimelineManifestV1 {
  version: "1";
  metadata: { project_id: string; run_id: string; format_mode: "documentary" | "listicle"; resolution: { width: number; height: number }; fps: number; duration_sec: number };
  tracks: { video: VideoClip[]; audio: AudioClip[]; captions: CaptionClip[]; broll?: BrollClip[]; music?: MusicClip[] };
  transitions?: Transition[];
  overlays?: Overlay[];
  graphics?: GraphicObject[];
  settings?: { captions_enabled?: boolean; caption_style?: CaptionStyleId; music_volume?: number; narration_volume?: number; sfx_volume?: number; clip_audio_volume?: number; theme_id?: string; background_color?: string; background_image?: string; overlay_drop_shadow?: boolean };
}
