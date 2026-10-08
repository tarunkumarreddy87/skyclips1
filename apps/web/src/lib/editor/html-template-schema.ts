import { z } from "zod";

export const htmlTemplateSchema = z.object({
  id: z.union([z.literal("press-cutout-v1"), z.string().uuid()]), profileId: z.string().min(1).max(128), name: z.string().min(1).max(100),
  description: z.string().max(600), tags: z.array(z.string()).max(12),
  html: z.string().min(1).max(200000), css: z.string().max(100000), js: z.string().max(100000),
  durationSec: z.number().finite().min(1).max(120), aiEnabled: z.boolean(),
  audioCues: z.array(z.object({at: z.number().finite().min(0).max(120), sound: z.enum(["whoosh", "impact", "tick", "rise", "press-paper", "press-impact", "press-marker", "press-whoosh", "press-pencil", "press-rise", "press-exit"]), gain: z.number().finite().min(0).max(1)}).strict()).max(30).optional(),
  assets: z.array(z.object({key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),
    kind: z.enum(["image", "video", "object"]), required: z.boolean(),
    url: z.string().max(2800000).regex(/^(https?:\/\/[^\s<>"']+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|)$/),
  }).strict()).max(12),
}).strict();
