import { z } from "zod";

const scalar = z.number().finite().min(-10000).max(10000);
const vector = z.tuple([scalar, scalar, scalar]);
const positive = z.number().finite().min(0.001).max(1000);
const scale = z.tuple([positive, positive, positive]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const pose = { position: vector.optional(), rotation: vector.optional(), scale: scale.optional() };
/** Data only: no scripts, network resources, custom shaders or unbounded geometry. */
export const threeSceneDataSchema = z.object({
  version: z.literal(1),
  background: color,
  camera: z.object({ position: vector, target: vector.optional(), fov: z.number().min(10).max(120).optional(), orbitSpeed: z.number().min(-4).max(4).optional() }).strict(),
  objects: z.array(z.object({
    id: z.string().min(1).max(80),
    geometry: z.enum(["box", "sphere", "torus", "cone", "cylinder", "plane"]),
    color, ...pose, spin: vector.optional(), wireframe: z.boolean().optional(),
    metalness: z.number().min(0).max(1).optional(), roughness: z.number().min(0.05).max(1).optional(),
    keyframes: z.array(z.object({ time_sec: z.number().min(0).max(86400), ...pose }).strict()).max(120).optional(),
  }).strict()).min(1).max(64),
}).strict();
export const threeSceneSchema = threeSceneDataSchema.superRefine((scene, ctx) => {
  const target = scene.camera.target ?? [0, 0, 0];
  if (Math.hypot(...scene.camera.position.map((v, i) => v - target[i]!)) < 0.01)
    ctx.addIssue({ code: "custom", path: ["camera"], message: "Camera must be away from its target" });
  const ids = new Set<string>();
  scene.objects.forEach((object, i) => {
    if (ids.has(object.id)) ctx.addIssue({ code: "custom", path: ["objects", i, "id"], message: "Duplicate object id" });
    ids.add(object.id);
    if (object.keyframes?.some((frame, j, frames) => j > 0 && frame.time_sec <= frames[j - 1]!.time_sec))
      ctx.addIssue({ code: "custom", path: ["objects", i, "keyframes"], message: "Keyframes must have increasing times" });
  });
});
export type ThreeScene = z.infer<typeof threeSceneDataSchema>;
export type ThreeObject = ThreeScene["objects"][number];
export type ThreeVector = [number, number, number];

/** Absolute-time evaluation makes scrubbing, splits and distributed exports identical. */
export function threeObjectPose(object: ThreeObject, seconds: number) {
  const time = Math.max(0, seconds);
  function at(key: "position" | "rotation" | "scale", fallback: ThreeVector): ThreeVector {
    const initial = object[key] ?? fallback;
    const frames = (object.keyframes ?? []).filter(frame => frame[key]);
    let left = { time_sec: 0, value: initial };
    for (const frame of frames) {
      const value = frame[key]!;
      if (frame.time_sec > time) {
        const fraction = Math.max(0, Math.min(1, (time - left.time_sec) / (frame.time_sec - left.time_sec)));
        const eased = fraction * fraction * (3 - 2 * fraction);
        return left.value.map((v, i) => v + (value[i]! - v) * eased) as ThreeVector;
      }
      left = { time_sec: frame.time_sec, value };
    }
    return [...left.value];
  }
  const rotation = at("rotation", [0, 0, 0]);
  return { position: at("position", [0, 0, 0]), scale: at("scale", [1, 1, 1]),
    rotation: rotation.map((v, i) => v + (object.spin?.[i] ?? 0) * time) as ThreeVector };
}

export function createThreePreset(name: "orbit" | "bars"): ThreeScene {
  return name === "orbit" ? {
    version: 1, background: "#080e1e", camera: { position: [0, 1.2, 6], orbitSpeed: 0.12 },
    objects: [
      { id: "globe", geometry: "sphere", color: "#38bdf8", wireframe: true, spin: [0, 0.2, 0], scale: [1.35, 1.35, 1.35] },
      { id: "orbit", geometry: "torus", color: "#fbbf24", rotation: [1.1, 0.2, 0.2], scale: [2, 2, 2], spin: [0.04, 0.1, 0] },
    ],
  } : {
    version: 1, background: "#080e1e", camera: { position: [5, 3.5, 8], target: [0, 0.5, 0] },
    objects: [1.2, 2, 3.2, 2.5].map((height, i) => ({ id: `bar-${i}`, geometry: "box" as const,
      color: i === 2 ? "#fbbf24" : "#38bdf8", position: [(i - 1.5) * 1.15, -0.5, 0], scale: [0.7, 0.01, 0.7],
      keyframes: [{ time_sec: i * 0.15, scale: [0.7, 0.01, 0.7], position: [(i - 1.5) * 1.15, -0.5, 0] },
        { time_sec: 1.3 + i * 0.15, scale: [0.7, height, 0.7], position: [(i - 1.5) * 1.15, height / 2 - 0.5, 0] }],
    })),
  };
}
