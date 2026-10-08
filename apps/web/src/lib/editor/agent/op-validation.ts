import { z } from "zod";
import { threeSceneSchema, DOCUMENTARY_LAYOUTS, MOTION_TEMPLATE_IDS, CAPTION_STYLE_IDS, VIDEO_FILTERS, VIDEO_EFFECTS } from "@hanuman/shared-types";
import { TRANSITION_SOUNDS } from "../transition-sounds";
import type { AgentOpName } from "./ops";
import { motionSceneSchema } from "./motion-scene-schema";
import { htmlTemplateSchema } from "../html-template-schema";

const id = z.string().trim().min(1).max(512);
const text = z.string().max(20000);
const number = z.number().finite();
const time = number.min(0);
const documentaryFields = {
  libraryTemplateId: z.string().uuid().optional(),
  htmlTemplate: htmlTemplateSchema.optional(),
  documentaryLayout: z.enum(DOCUMENTARY_LAYOUTS).optional(),
  elements: z.array(z.object({ label: z.string().min(1).max(60), detail: z.string().max(140).optional() }).strict()).max(6).optional(),
  links: z.array(z.object({ from: z.number().int().min(0).max(5), to: z.number().int().min(0).max(5) }).strict()).max(6).optional(),
};
const duration = number.positive();
const volume = number.min(0).max(1);
const url = z.string().max(8192).refine((value) => /^https?:\/\//i.test(value) || value.startsWith("/api/") || value.startsWith("blob:") || value.startsWith("data:audio/") || TRANSITION_SOUNDS.some(sound => value === `/sfx/${sound.file}`));
const captionStyle = z.enum(CAPTION_STYLE_IDS);
const theme = z.enum(["crime", "history", "modern", "minimalist", "standard"]);
const transform = z.object({
  x: number.optional(), y: number.optional(), scaleX: number.refine((v) => v !== 0).optional(),
  scaleY: number.refine((v) => v !== 0).optional(), rotation: number.optional(), zIndex: number.int().optional(),
});
const preset = z.enum(["none", "fade", "float", "zoom_in", "zoom_out", "ken_burns_in", "ken_burns_out", "parallax_pan_in", "parallax_pan_out", "drop", "slide", "wipe", "pop", "bounce", "spin", "slide_bounce"]);
const edge = z.object({ preset, durationMs: time.default(400) });
const animation = z.object({
  in: edge.optional(), out: edge.optional(),
  loop: z.object({ preset: z.enum(["none", "pulse", "ken_burns", "float", "parallax_pan"]), params: z.record(z.string(), z.unknown()).optional() }).optional(),
});
const transition = z.enum(["cut", "zoom", "slide-pan", "film-burn", "glitch", "fade", "slide", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "slideup", "slidedown", "circleopen", "circleclose", "dissolve", "pixelize"]);
const slots = z.array(z.object({ text: text.optional(), label: text.optional(), value: number.optional(), color: text.optional() })).max(100);
const item = { itemId: id };
const media = { label: text.optional(), url: url.optional(), startMs: time.optional(), durationMs: duration.optional(), volume: volume.optional() };
const coordinate = number.min(-100).max(200);
const color = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
const graphicKeyframes = z.array(z.object({ time_sec: number.min(0).max(86400), x: coordinate.optional(), y: coordinate.optional(), scale: number.min(0.01).max(10).optional(), rotation: number.min(-3600).max(3600).optional(), opacity: volume.optional() }).strict()).max(100).refine(frames => frames.every((frame, index) => index === 0 || frame.time_sec > frames[index - 1]!.time_sec));
const graphicFields = {
  type: z.enum(["frame", "bar_chart", "shape"]), text: text.max(4000).optional(), src: url.optional(), color: color.optional(),
  width_pct: number.min(1).max(100).optional(), height_pct: number.min(1).max(100).optional(), shape: z.enum(["rectangle", "circle"]).optional(),
  data: z.array(z.object({ label: z.string().max(60), value: number.min(0).max(1e12) }).strict()).min(1).max(12).optional(),
  transform: transform.optional(), keyframes: graphicKeyframes.optional(),
};
const schemas: Record<AgentOpName, z.ZodType> = {
  add_graphic: z.object({ ...graphicFields, startMs: time.optional(), durationMs: duration.optional() }).refine(v => v.type !== "bar_chart" || Boolean(v.data?.length)).refine(v => !v.keyframes?.some(frame => frame.time_sec > (v.durationMs ?? 4000) / 1000)),
  update_graphic: z.object({ ...item, patch: z.object(graphicFields).partial().strict().refine(v => Object.keys(v).length > 0) }),
  set_keyframes: z.object({ ...item, keyframes: graphicKeyframes }),
  add_media: z.object({ assetId: id, startMs: time.optional(), durationMs: duration.optional() }),
  update_track: z.object({ trackId: id, hidden: z.boolean().optional(), locked: z.boolean().optional() }).refine(v => v.hidden != null || v.locked != null),
  update_clip: z.object({ ...item, fitMode: z.enum(["cover", "contain", "fill"]).optional(), muted: z.boolean().optional(), threeScene: threeSceneSchema.nullable().optional() }).refine(v => v.fitMode != null || v.muted != null || v.threeScene !== undefined),
  undo: z.object({}), redo: z.object({}),
  update_clip_effects: z.object({ ...item, patch: z.object({
    filterId: z.enum(VIDEO_FILTERS.map(f => f.id)).optional(), strength: volume.optional(),
    brightness: number.min(0).max(2).optional(), contrast: number.min(0).max(2).optional(), saturation: number.min(0).max(2).optional(),
    effectId: z.enum(VIDEO_EFFECTS.map(f => f.id)).optional(), effectStrength: volume.optional(),
  }).strict().refine(v => Object.keys(v).length > 0) }),
  set_transition_sound: z.object({ transitionId: id, enabled: z.boolean() }),
  add_motion_scene: z.object({ scene: motionSceneSchema, startMs: time.optional() }),
  update_motion_scene: z.object({ ...item, scene: motionSceneSchema }),
  delete_item: z.object(item),
  move_item: z.object({ ...item, startMs: time }),
  trim_item: z.object({ ...item, startMs: time, endMs: time }).refine((v) => v.endMs > v.startMs),
  replace_media: z.object({ ...item, url, sourceLabel: text.optional() }),
  add_caption: z.object({ text: text.min(1), startMs: time.optional(), durationMs: duration.optional() }),
  add_text: z.object({ text: text.min(1), startMs: time.optional(), durationMs: duration.optional() }),
  update_text: z.object({ ...item, text: text.optional(), fontSize: duration.max(1000).optional(), color: text.optional(), fontWeight: text.optional(), alignment: z.enum(["left", "center", "right"]).optional(), fontFamily: id.optional(), boxWidthPct: number.min(18).max(88).optional(), stylePreset: id.optional() }),
  update_text_position: z.object({ ...item, x: number, y: number }),
  add_music: z.object(media), add_sfx: z.object({ ...media, preset: z.enum(["soft_whoosh", "soft_impact", "editorial_tick"]).optional() }), add_broll: z.object({ ...media, mediaType: z.enum(["image", "video"]).optional() }),
  set_volume: z.object({ ...item, volume }),
  add_transition: z.object({ afterItemId: id, type: transition, durationMs: time.optional() }),
  set_transition: z.object({ transitionId: id, type: transition, durationMs: time.optional() }),
  remove_transition: z.object({ transitionId: id }),
  add_animation: z.object({ preset: z.enum(MOTION_TEMPLATE_IDS), startMs: time.optional() }),
  add_motion_template: z.object({ ...documentaryFields, itemId: id.optional(), templateId: z.enum(MOTION_TEMPLATE_IDS), startMs: time.optional(), durationMs: duration.optional(), title: text.optional(), subtitle: text.optional(), slots: slots.optional(), imageRefs: z.array(id).max(100).optional(), themeId: theme.optional(), sourceLabel: text.optional() }),
  update_item_animation: z.object({ ...item, animation }),
  update_transform: z.object({ ...item, transform }),
  update_fit_mode: z.object({ ...item, fitMode: z.enum(["cover", "contain", "fill"]) }),
  update_audio_fades: z.object({ ...item, fadeInMs: time, fadeOutMs: time }),
  update_caption_style: z.object({ style: captionStyle }),
  duplicate_item: z.object(item), split_item: z.object({ ...item, atMs: time.optional() }),
  update_settings: z.object({ patch: z.object({
    backgroundColor: text.optional(), backgroundImage: url.nullable().optional(),
    overlayDropShadow: z.boolean().optional(), narrationVolume: volume.optional(), musicVolume: volume.optional(), sfxVolume: volume.optional(),
    clipAudioVolume: volume.optional(), captionsEnabled: z.boolean().optional(), showTransitions: z.boolean().optional(), captionStyle: captionStyle.optional(),
  }).strict() }),
  toggle_captions: z.object({ enabled: z.boolean() }),
  select_item: z.object(item), set_playhead: z.object({ ms: time }),
  update_motion_template: z.object({ ...item, layerEdits: z.record(z.string().min(1).max(128), z.object({text:text.optional(),color:text.optional(),fontSize:number.min(1).max(500).optional(),x:number.min(-3840).max(3840).optional(),y:number.min(-2160).max(2160).optional(),scaleX:number.min(0.05).max(20).optional(),scaleY:number.min(0.05).max(20).optional(),hidden:z.boolean().optional()}).strict()).optional(), ...documentaryFields, title: text.optional(), subtitle: text.optional(), slots: slots.optional(), imageRefs: z.array(id).max(100).optional(), themeId: theme.optional(), sourceLabel: text.optional(), boxWidthPct: number.min(18).max(88).optional() }),
  set_text_style: z.object({ ...item, stylePreset: id.optional(), fontFamily: id.optional(), boxWidthPct: number.min(18).max(88).optional() }),
  set_clip_muted: z.object({ ...item, muted: z.boolean() }),
  toggle_item_hidden: z.object(item), bring_to_front: z.object(item), send_to_back: z.object(item),
  set_theme: z.object({ themeId: theme }),
  toggle_track_hidden: z.object({ trackType: z.enum(["video", "broll", "text", "captions", "animation", "music", "sfx", "narration"]) }),
};

export function parseAgentPayload(op: AgentOpName, payload: unknown): Record<string, unknown> | null {
  const result = schemas[op].safeParse(payload);
  return result.success ? { ...(result.data as Record<string, unknown>), op } : null;
}

