import { z } from "zod";

const number = z.number().finite();
const color = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
const keyframe = z.object({ timeMs: number.min(0).max(30000), x: number.min(-200).max(300).optional(), y: number.min(-200).max(300).optional(), scale: number.min(0).max(8).optional(), rotation: number.min(-1080).max(1080).optional(), opacity: number.min(0).max(1).optional(), reveal: number.min(0).max(1).optional(), value: number.min(-1e15).max(1e15).optional() }).strict();
export const motionSceneSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(160), durationMs: number.min(1000).max(30000), background: z.union([color, z.literal("transparent")]),
  layers: z.array(z.object({
    id: z.string().min(1).max(80), kind: z.enum(["text", "rectangle", "ellipse", "line", "image", "counter"]),
    x: number.min(-100).max(200), y: number.min(-100).max(200), width: number.positive().max(200), height: number.positive().max(200),
    text: z.string().max(1200).optional(), src: z.string().max(8192).url().regex(/^https?:\/\//).optional(), color,
    fontSize: number.min(12).max(300), fontWeight: number.int().min(100).max(900), fontFamily: z.enum(["sans", "serif", "mono"]), align: z.enum(["left", "center", "right"]),
    radius: number.min(0).max(200), strokeWidth: number.min(0).max(30), strokeColor: color, shadow: number.min(0).max(60),
    startMs: number.min(0).max(30000), endMs: number.positive().max(30000), easing: z.enum(["linear", "smooth", "spring"]),
    keyframes: z.array(keyframe).max(24), prefix: z.string().max(30).optional(), suffix: z.string().max(30).optional(),
  }).strict()).min(1).max(48),
  audio: z.array(z.object({ sound: z.enum(["whoosh", "impact", "tick", "rise", "ambient"]), startMs: number.min(0), volume: number.min(0).max(1) }).strict()).max(16),
}).strict().refine(scene => new Set(scene.layers.map(l => l.id)).size === scene.layers.length && scene.layers.every(layer => layer.endMs > layer.startMs && layer.endMs <= scene.durationMs && (layer.kind !== "image" || Boolean(layer.src)) && layer.keyframes.every((k, i) => k.timeMs <= scene.durationMs && (!i || k.timeMs > layer.keyframes[i - 1]!.timeMs))) && scene.audio.every(c => c.startMs < scene.durationMs));
