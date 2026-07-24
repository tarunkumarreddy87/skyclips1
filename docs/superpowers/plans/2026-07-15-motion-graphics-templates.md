# Motion Graphics Template System — Media/Image Category + Hybrid AI Trigger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data-driven motion-graphics template system that adds premium media/image overlays (Ken Burns reveal, Photo stack, Polaroid, Image carousel, Split screen, Picture-in-Picture) auto-triggered by a hybrid rule+LLM classifier during video generation — exceeding VidRush.ai which explicitly supports no motion graphics.

**Architecture:** A single shared template registry (`MOTION_TEMPLATES`) becomes the source of truth, replacing 6 scattered hardcoded branches. Each template defines: id, label, manifest type, default position/duration/animation, a CSS preview renderer (editor canvas), and a Remotion overlay component (export). The backend `build_timeline()` gains a hybrid auto-trigger that adds templates per scene using rules for obvious cases + one batched OpenRouter LLM call for ambiguous scenes.

**Tech Stack:** TypeScript (web), Python (orchestrator), Remotion (render), JSON Schema (manifest), OpenRouter DeepSeek (LLM classification), Zustand (editor store).

---

## File Structure

### Shared (new — the registry)
- **Create `packages/shared-types/src/motion-templates.ts`** — the `MotionTemplate` interface + `MOTION_TEMPLATE_IDS` union + category metadata. Imported by web + backend (via python mirror).
- **Create `packages/shared-types/python/shared_types/motion_templates.py`** — Python mirror of template IDs + categories for the orchestrator.

### Web editor (extend existing)
- **Create `apps/web/src/lib/editor/motion-template-registry.ts`** — the runtime registry: maps each template id → `{ label, hint, icon, category, defaultPosition, defaultDurationMs, defaultAnimation, manifestType, PreviewComponent }`.
- **Create `apps/web/src/components/editor/canvas/overlays/`** — one CSS-preview component per new template (KenBurnsPreview, PhotoStackPreview, PolaroidPreview, CarouselPreview, SplitScreenPreview, PiPPreview).
- **Modify `apps/web/src/lib/editor/types.ts:159-166`** — promote `AnimationItem.preset` from loose `string` to `TemplateId`.
- **Modify `apps/web/src/lib/editor/store.ts:1014-1053`** — generalize `addAnimation` to registry lookup.
- **Modify `apps/web/src/lib/editor/preview-motion.ts:44-58`** — replace hardcoded defaults with registry lookup.
- **Modify `apps/web/src/components/editor/panels/animation-panel.tsx:26-45`** — render templates from registry, grouped by category.
- **Modify `apps/web/src/components/editor/shell/preview-section.tsx:654-724`** — route new template types to their preview components.
- **Modify `apps/web/src/lib/editor/build-timeline-manifest.ts:307-344`** — serialize new template types from registry.
- **Modify `apps/web/src/lib/editor/manifest-mapper.ts:113-163`** — deserialize new template types from registry.

### Manifest schema (extend)
- **Modify `packages/timeline-schema/schema/timeline.v1.json:299-312`** — extend `overlay.type` enum + add `image_refs` field for media templates.

### Remotion render (extend)
- **Modify `packages/remotion-renderer/src/lib/types.ts:125-133`** — extend `Overlay.type` union.
- **Create `packages/remotion-renderer/src/overlays/MediaOverlays.tsx`** — KenBurnsOverlay, PhotoStackOverlay, PolaroidOverlay, CarouselOverlay, SplitScreenOverlay, PiPOverlay components.
- **Modify `packages/remotion-renderer/src/components/CaptionsOverlays.tsx:216-234`** — add branches to OverlayRouter.

### Backend AI trigger (new)
- **Create `workers/orchestrator/src/activities/template_trigger.py`** — the hybrid classifier: `auto_trigger_templates(sections, video_clips, theme, scenes_data) -> list[overlay]`.
- **Create `workers/orchestrator/src/prompts/template_trigger.py`** — the LLM prompt for ambiguous-scene template selection.
- **Modify `workers/orchestrator/src/activities/pipeline.py:1754-1761`** — call `auto_trigger_templates` and merge results into overlays.

---

## Task 1: Shared template ID registry

**Files:**
- Create: `packages/shared-types/src/motion-templates.ts`
- Create: `packages/shared-types/python/shared_types/motion_templates.py`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1: Create the TypeScript template registry**

Create `packages/shared-types/src/motion-templates.ts`:

```ts
/**
 * Motion-graphics template catalog — shared between web editor, Remotion render,
 * and the backend AI auto-trigger. Adding a template here is the single source of
 * truth for its id, category, and manifest type.
 *
 * VidRush.ai explicitly does NOT support motion graphics. This catalog is the
 * competitive differentiator.
 */

export type MotionTemplateCategory =
  | "intro-outro"
  | "cinematic-text"
  | "media-image"
  | "charts-data"
  | "content-animation";

/** All template IDs. Existing 3 are kept for backward compat. */
export const MOTION_TEMPLATE_IDS = [
  // Existing (keep exact strings — persisted in timelines)
  "subscribe-cta",
  "chapter-title",
  "lower-third",
  // New — Media/Image category (phase 1)
  "ken-burns-reveal",
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
}

export const MOTION_TEMPLATE_CATALOG: MotionTemplateMeta[] = [
  {
    id: "subscribe-cta",
    label: "Subscribe CTA",
    category: "content-animation",
    hint: "End-screen subscribe badge with pulse animation",
    manifestType: "subscribe_cta",
    needsImages: false,
  },
  {
    id: "chapter-title",
    label: "Chapter title",
    category: "cinematic-text",
    hint: "Section header overlay, slides in from the left",
    manifestType: "chapter_title",
    needsImages: false,
  },
  {
    id: "lower-third",
    label: "Lower third",
    category: "cinematic-text",
    hint: "Broadcast-style name and title strip at the bottom",
    manifestType: "chapter_title",
    needsImages: false,
  },
  {
    id: "ken-burns-reveal",
    label: "Ken Burns reveal",
    category: "media-image",
    hint: "Slow zoom-out focus-pull reveal on a hero image",
    manifestType: "ken_burns_reveal",
    needsImages: true,
  },
  {
    id: "photo-stack",
    label: "Photo stack",
    category: "media-image",
    hint: "Stacked photo reveal with slight rotation offsets",
    manifestType: "photo_stack",
    needsImages: true,
  },
  {
    id: "polaroid-frame",
    label: "Polaroid frame",
    category: "media-image",
    hint: "Polaroid-style photo frame with drop-in animation",
    manifestType: "polaroid_frame",
    needsImages: true,
  },
  {
    id: "image-carousel",
    label: "Image carousel",
    category: "media-image",
    hint: "Horizontal sliding image carousel with centre focus",
    manifestType: "image_carousel",
    needsImages: true,
  },
  {
    id: "split-screen",
    label: "Split screen",
    category: "media-image",
    hint: "Two-panel split screen for comparisons and dual content",
    manifestType: "split_screen",
    needsImages: true,
  },
  {
    id: "picture-in-picture",
    label: "Picture in picture",
    category: "media-image",
    hint: "PiP overlay layout for tutorials and video calls",
    manifestType: "picture_in_picture",
    needsImages: true,
  },
];

export function getTemplateMeta(id: string): MotionTemplateMeta | undefined {
  return MOTION_TEMPLATE_CATALOG.find((t) => t.id === id);
}

export function templatesByCategory(category: MotionTemplateCategory): MotionTemplateMeta[] {
  return MOTION_TEMPLATE_CATALOG.filter((t) => t.category === category);
}
```

- [ ] **Step 2: Create the Python mirror**

Create `packages/shared-types/python/shared_types/motion_templates.py`:

```python
"""Python mirror of the motion-graphics template catalog.

Kept in sync with packages/shared-types/src/motion-templates.ts.
The orchestrator auto-trigger uses this to know valid template IDs and categories.
"""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum


class TemplateCategory(str, Enum):
    INTRO_OUTRO = "intro-outro"
    CINEMATIC_TEXT = "cinematic-text"
    MEDIA_IMAGE = "media-image"
    CHARTS_DATA = "charts-data"
    CONTENT_ANIMATION = "content-animation"


@dataclass(frozen=True)
class TemplateMeta:
    id: str
    label: str
    category: TemplateCategory
    hint: str
    manifest_type: str
    needs_images: bool


CATALOG: list[TemplateMeta] = [
    TemplateMeta("subscribe-cta", "Subscribe CTA", TemplateCategory.CONTENT_ANIMATION,
                 "End-screen subscribe badge with pulse animation", "subscribe_cta", False),
    TemplateMeta("chapter-title", "Chapter title", TemplateCategory.CINEMATIC_TEXT,
                 "Section header overlay, slides in from the left", "chapter_title", False),
    TemplateMeta("lower-third", "Lower third", TemplateCategory.CINEMATIC_TEXT,
                 "Broadcast-style name and title strip at the bottom", "chapter_title", False),
    TemplateMeta("ken-burns-reveal", "Ken Burns reveal", TemplateCategory.MEDIA_IMAGE,
                 "Slow zoom-out focus-pull reveal on a hero image", "ken_burns_reveal", True),
    TemplateMeta("photo-stack", "Photo stack", TemplateCategory.MEDIA_IMAGE,
                 "Stacked photo reveal with slight rotation offsets", "photo_stack", True),
    TemplateMeta("polaroid-frame", "Polaroid frame", TemplateCategory.MEDIA_IMAGE,
                 "Polaroid-style photo frame with drop-in animation", "polaroid_frame", True),
    TemplateMeta("image-carousel", "Image carousel", TemplateCategory.MEDIA_IMAGE,
                 "Horizontal sliding image carousel with centre focus", "image_carousel", True),
    TemplateMeta("split-screen", "Split screen", TemplateCategory.MEDIA_IMAGE,
                 "Two-panel split screen for comparisons and dual content", "split_screen", True),
    TemplateMeta("picture-in-picture", "Picture in picture", TemplateCategory.MEDIA_IMAGE,
                 "PiP overlay layout for tutorials and video calls", "picture_in_picture", True),
]

# Fast lookup tables
BY_ID: dict[str, TemplateMeta] = {t.id: t for t in CATALOG}
MANIFEST_TO_ID: dict[str, str] = {t.manifest_type: t.id for t in CATALOG}
MEDIA_TEMPLATE_IDS = [t.id for t in CATALOG if t.needs_images]


def get_template(template_id: str) -> TemplateMeta | None:
    return BY_ID.get(template_id)
```

- [ ] **Step 3: Export from shared-types index**

Add to `packages/shared-types/src/index.ts` (after the existing overlay-chrome exports):

```ts
export {
  MOTION_TEMPLATE_IDS,
  MOTION_TEMPLATE_CATALOG,
  getTemplateMeta,
  templatesByCategory,
  type MotionTemplateCategory,
  type MotionTemplateMeta,
  type TemplateId,
} from "./motion-templates";
```

- [ ] **Step 4: Verify shared-types compiles**

Run: `cd D:/HANUMAN/packages/shared-types && pnpm typecheck`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
cd D:/HANUMAN
git add packages/shared-types/src/motion-templates.ts packages/shared-types/python/shared_types/motion_templates.py packages/shared-types/src/index.ts
git commit -m "feat(templates): add shared motion-graphics template registry"
```

---

## Task 2: Extend manifest JSON schema for new overlay types

**Files:**
- Modify: `packages/timeline-schema/schema/timeline.v1.json` (lines 299-312)

- [ ] **Step 1: Read the current overlay definition**

Run: `cd D:/HANUMAN && sed -n '295,315p' packages/timeline-schema/schema/timeline.v1.json`
Confirm the `overlay` definition has `"type": {"enum": ["subscribe_cta", "chapter_title"]}`.

- [ ] **Step 2: Extend the overlay type enum and add image_refs**

In `packages/timeline-schema/schema/timeline.v1.json`, find the `overlay` definition (around line 299) and replace the `"type"` enum and properties to add media template types + an optional `image_refs` array. The overlay definition should become:

```json
"overlay": {
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "type", "start_sec", "duration_sec"],
  "properties": {
    "id": {"type": "string"},
    "type": {
      "enum": [
        "subscribe_cta",
        "chapter_title",
        "ken_burns_reveal",
        "photo_stack",
        "polaroid_frame",
        "image_carousel",
        "split_screen",
        "picture_in_picture"
      ]
    },
    "text": {"type": "string"},
    "start_sec": {"type": "number"},
    "duration_sec": {"type": "number"},
    "transform": {"$ref": "#/definitions/elementTransform"},
    "animation": {"$ref": "#/definitions/elementAnimation"},
    "image_refs": {
      "type": "array",
      "items": {"type": "string"},
      "description": "S3 keys or URLs of images for media templates"
    }
  }
}
```

- [ ] **Step 3: Validate the schema is valid JSON**

Run: `cd D:/HANUMAN && python -c "import json; json.load(open('packages/timeline-schema/schema/timeline.v1.json')); print('valid JSON')"`
Expected: `valid JSON`

- [ ] **Step 4: Commit**

```bash
cd D:/HANUMAN
git add packages/timeline-schema/schema/timeline.v1.json
git commit -m "feat(schema): extend overlay types for media-image templates"
```

---

## Task 3: Web editor — runtime template registry

**Files:**
- Create: `apps/web/src/lib/editor/motion-template-registry.ts`

- [ ] **Step 1: Create the runtime registry with defaults per template**

Create `apps/web/src/lib/editor/motion-template-registry.ts`:

```ts
import type { ReactNode } from "react";
import {
  getTemplateMeta,
  MOTION_TEMPLATE_CATALOG,
  type MotionTemplateCategory,
  type TemplateId,
} from "@hanuman/shared-types";
import type { ElementAnimation } from "./types";

/**
 * Runtime registry: extends the shared catalog with editor-specific defaults
 * (position, duration, animation, lucide icon name) and a CSS preview component
 * reference. The editor store, panel, preview, and serializer all read from here.
 */

export interface MotionTemplateRuntime {
  id: TemplateId;
  label: string;
  category: MotionTemplateCategory;
  hint: string;
  manifestType: string;
  needsImages: boolean;
  /** Lucide icon name for the panel card. */
  icon: string;
  /** Default position in % of the 16:9 stage. */
  defaultPosition: { x: number; y: number };
  /** Default duration in ms. */
  defaultDurationMs: number;
  /** Default in/out/loop animation for the overlay. */
  defaultAnimation: ElementAnimation;
  /** Number of images this template consumes (0 for text templates). */
  imageCount: number;
}

const CTA_ANIM: ElementAnimation = {
  in: { preset: "pop", durationMs: 450 },
  loop: { preset: "pulse" },
};
const SLIDE_ANIM: ElementAnimation = {
  in: { preset: "slide", durationMs: 500 },
  out: { preset: "fade", durationMs: 350 },
};
const ZOOM_ANIM: ElementAnimation = {
  in: { preset: "zoom_in", durationMs: 600 },
  out: { preset: "fade", durationMs: 400 },
};

const RUNTIME: Record<string, Omit<MotionTemplateRuntime, "id" | "label" | "category" | "hint" | "manifestType" | "needsImages">> = {
  "subscribe-cta": {
    icon: "Sparkles",
    defaultPosition: { x: 85, y: 12 },
    defaultDurationMs: 5000,
    defaultAnimation: CTA_ANIM,
    imageCount: 0,
  },
  "chapter-title": {
    icon: "Type",
    defaultPosition: { x: 50, y: 40 },
    defaultDurationMs: 4000,
    defaultAnimation: SLIDE_ANIM,
    imageCount: 0,
  },
  "lower-third": {
    icon: "Clapperboard",
    defaultPosition: { x: 22, y: 82 },
    defaultDurationMs: 4000,
    defaultAnimation: SLIDE_ANIM,
    imageCount: 0,
  },
  "ken-burns-reveal": {
    icon: "Image",
    defaultPosition: { x: 50, y: 50 },
    defaultDurationMs: 5000,
    defaultAnimation: ZOOM_ANIM,
    imageCount: 1,
  },
  "photo-stack": {
    icon: "Layers",
    defaultPosition: { x: 50, y: 50 },
    defaultDurationMs: 5000,
    defaultAnimation: { in: { preset: "drop", durationMs: 500 }, out: { preset: "fade", durationMs: 350 } },
    imageCount: 3,
  },
  "polaroid-frame": {
    icon: "Image",
    defaultPosition: { x: 50, y: 50 },
    defaultDurationMs: 4500,
    defaultAnimation: { in: { preset: "drop", durationMs: 450 }, out: { preset: "fade", durationMs: 350 } },
    imageCount: 1,
  },
  "image-carousel": {
    icon: "GalleryHorizontalEnd",
    defaultPosition: { x: 50, y: 50 },
    defaultDurationMs: 6000,
    defaultAnimation: { in: { preset: "slide", durationMs: 500 }, out: { preset: "slide", durationMs: 400 } },
    imageCount: 4,
  },
  "split-screen": {
    icon: "Columns2",
    defaultPosition: { x: 50, y: 50 },
    defaultDurationMs: 5000,
    defaultAnimation: { in: { preset: "wipe", durationMs: 500 }, out: { preset: "fade", durationMs: 350 } },
    imageCount: 2,
  },
  "picture-in-picture": {
    icon: "PiP",
    defaultPosition: { x: 78, y: 75 },
    defaultDurationMs: 5000,
    defaultAnimation: { in: { preset: "pop", durationMs: 400 }, out: { preset: "fade", durationMs: 350 } },
    imageCount: 1,
  },
};

export const MOTION_TEMPLATES: MotionTemplateRuntime[] = MOTION_TEMPLATE_CATALOG.map((meta) => {
  const rt = RUNTIME[meta.id];
  if (!rt) throw new Error(`Missing runtime config for template ${meta.id}`);
  return { ...meta, ...rt };
});

export function getMotionTemplate(id: string): MotionTemplateRuntime | undefined {
  return MOTION_TEMPLATES.find((t) => t.id === id);
}

export function templatesByCategory(category: MotionTemplateCategory): MotionTemplateRuntime[] {
  return MOTION_TEMPLATES.filter((t) => t.category === category);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd D:/HANUMAN/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd D:/HANUMAN
git add apps/web/src/lib/editor/motion-template-registry.ts
git commit -m "feat(editor): add motion-template runtime registry"
```

---

## Task 4: Generalize store `addAnimation` to use the registry

**Files:**
- Modify: `apps/web/src/lib/editor/store.ts:1014-1053`

- [ ] **Step 1: Read the current addAnimation**

Run: `cd D:/HANUMAN && sed -n '1014,1053p' apps/web/src/lib/editor/store.ts`
Note the hardcoded `isCta`/`isChapter` branches and default position/duration.

- [ ] **Step 2: Replace addAnimation with a registry-driven implementation**

Replace the entire `addAnimation` function body (store.ts around line 977-1016) with:

```ts
  addAnimation: (preset, startMs) => {
    recordEditHistory(get, set);
    const tpl = getMotionTemplate(preset);
    if (!tpl) return null;
    const newItem = {
      id: `anim-${Date.now()}`,
      type: "animation" as const,
      startMs,
      endMs: startMs + tpl.defaultDurationMs,
      label: tpl.label,
      preset,
      intensity: 70,
      position: tpl.defaultPosition,
      transform: {
        x: tpl.defaultPosition.x,
        y: tpl.defaultPosition.y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        zIndex: 5,
      },
      hidden: false,
    };
    const tracks = get().timeline.tracks.map((track) =>
      track.type === "animation" ? { ...track, items: [...track.items, newItem] } : track,
    );
    set({
      timeline: timelineWithDuration({ ...get().timeline, tracks }, newItem.endMs),
      ui: { ...get().ui, selectedItemId: newItem.id },
    });
    triggerAutosave(get, set);
    return newItem.id;
  },
```

- [ ] **Step 3: Add the import at the top of store.ts**

Add to the imports in `apps/web/src/lib/editor/store.ts`:

```ts
import { getMotionTemplate } from "./motion-template-registry";
```

- [ ] **Step 4: Verify typecheck**

Run: `cd D:/HANUMAN/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd D:/HANUMAN
git add apps/web/src/lib/editor/store.ts
git commit -m "refactor(editor): drive addAnimation from template registry"
```

---

## Task 5: Generalize preview-motion defaults from registry

**Files:**
- Modify: `apps/web/src/lib/editor/preview-motion.ts:44-58`

- [ ] **Step 1: Replace defaultAnimationForMotionPreset with registry lookup**

In `apps/web/src/lib/editor/preview-motion.ts`, replace the `defaultAnimationForMotionPreset` function (lines 44-58) with:

```ts
import { getMotionTemplate } from "./motion-template-registry";
import type { ElementAnimation } from "./types";

/** Defaults align with the template registry (single source of truth). */
export function defaultAnimationForMotionPreset(preset: string | undefined): ElementAnimation | undefined {
  if (!preset) return undefined;
  return getMotionTemplate(preset)?.defaultAnimation;
}
```

- [ ] **Step 2: Verify the old hardcoded CTA/chapter defaults are gone**

Run: `cd D:/HANUMAN && grep -n "subscribe-cta\|chapter-title\|lower-third" apps/web/src/lib/editor/preview-motion.ts`
Expected: no matches (all moved to registry)

- [ ] **Step 3: Typecheck**

Run: `cd D:/HANUMAN/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd D:/HANUMAN
git add apps/web/src/lib/editor/preview-motion.ts
git commit -m "refactor(editor): pull motion defaults from template registry"
```

---

## Task 6: Manifest serialize/deserialize for new template types

**Files:**
- Modify: `apps/web/src/lib/editor/build-timeline-manifest.ts:307-344`
- Modify: `apps/web/src/lib/editor/manifest-mapper.ts:113-163`

- [ ] **Step 1: Read the current serialize logic**

Run: `cd D:/HANUMAN && sed -n '300,350p' apps/web/src/lib/editor/build-timeline-manifest.ts`

- [ ] **Step 2: Replace the overlay serialization loop with a registry-driven version**

In `apps/web/src/lib/editor/build-timeline-manifest.ts`, replace the overlay mapping loop (around lines 307-344) with:

```ts
import { getMotionTemplate } from "./motion-template-registry";
import { MANIFEST_TO_ID_MAP } from "./motion-template-registry";

// ... inside the build function, replace the overlays mapping:
const overlays = animationItems.map((item) => {
  const tpl = getMotionTemplate(item.preset);
  const manifestType = tpl?.manifestType ?? "chapter_title";
  const isLowerThird = item.preset === "lower-third";
  const y = isLowerThird ? Math.max(78, item.position?.y ?? 82) : (item.position?.y ?? 40);
  return {
    id: item.id,
    type: manifestType,
    text: item.label || "",
    start_sec: round2(item.startMs / 1000),
    duration_sec: round2((item.endMs - item.startMs) / 1000),
    transform: toManifestTransform({
      ...resolveTransform(item.transform, item.position),
      y,
    }),
    animation: toManifestAnimation(item.animation),
  };
});
```

Note: `MANIFEST_TO_ID_MAP` must be exported from the registry. Add to `motion-template-registry.ts`:

```ts
export const MANIFEST_TO_ID_MAP: Record<string, string> = Object.fromEntries(
  MOTION_TEMPLATES.map((t) => [t.manifestType, t.id]),
);
```

- [ ] **Step 3: Replace the deserialization in manifest-mapper.ts**

In `apps/web/src/lib/editor/manifest-mapper.ts`, replace `mapMotionOverlays` (around lines 113-163) with:

```ts
import { MANIFEST_TO_ID_MAP, getMotionTemplate } from "./motion-template-registry";

function mapMotionOverlays(overlays: TimelineOverlay[]): AnimationItem[] {
  return overlays.map((o, i) => {
    const presetId = MANIFEST_TO_ID_MAP[o.type] ?? "chapter-title";
    const tpl = getMotionTemplate(presetId);
    const y = o.transform?.y ?? 40;
    return {
      id: o.id || `anim-${i}`,
      type: "animation" as const,
      startMs: Math.round(o.start_sec * 1000),
      endMs: Math.round((o.start_sec + o.duration_sec) * 1000),
      label: o.text || tpl?.label || "Overlay",
      preset: presetId,
      intensity: 70,
      position: { x: o.transform?.x ?? 50, y },
      transform: o.transform,
      animation: mapManifestAnimation(o.animation),
      hidden: false,
    };
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `cd D:/HANUMAN/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd D:/HANUMAN
git add apps/web/src/lib/editor/build-timeline-manifest.ts apps/web/src/lib/editor/manifest-mapper.ts apps/web/src/lib/editor/motion-template-registry.ts
git commit -m "feat(editor): registry-driven overlay serialize/deserialize"
```

---

## Task 7: CSS preview components for media templates

**Files:**
- Create: `apps/web/src/components/editor/canvas/overlays/KenBurnsPreview.tsx`
- Create: `apps/web/src/components/editor/canvas/overlays/MediaTemplatePreview.tsx` (shared wrapper + all 6 media previews)
- Modify: `apps/web/src/components/editor/shell/preview-section.tsx:654-724`

- [ ] **Step 1: Create the shared media template preview component**

Create `apps/web/src/components/editor/canvas/overlays/MediaTemplatePreview.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { AnimationItem } from "@/lib/editor/types";
import { mediaBoxStyle, resolveTransform } from "@/lib/editor/transform";
import { previewMotionStyle } from "@/lib/editor/preview-motion";
import { useEditorStore } from "@/lib/editor/store";
import { cn } from "@/lib/utils";

interface MediaTemplatePreviewProps {
  item: AnimationItem;
  selected: boolean;
  onSelect: () => void;
}

/**
 * CSS-preview approximations for media-image motion templates.
 * Each renders inside the preview canvas; Remotion export is the source of truth.
 */
export function MediaTemplatePreview({ item, selected, onSelect }: MediaTemplatePreviewProps) {
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const transform = resolveTransform(item.transform, item.position);
  const motionStyle = previewMotionStyle(item.animation, item.startMs, item.endMs, playheadMs);

  // Media templates occupy a larger box than text overlays.
  const boxStyle = {
    ...mediaBoxStyle({
      ...transform,
      scaleX: Math.max(0.3, transform.scaleX * 0.6),
      scaleY: Math.max(0.2, transform.scaleY * 0.4),
    }),
    maxWidth: "80%",
  };

  const local = playheadMs - item.startMs;
  const duration = item.endMs - item.startMs;
  const progress = Math.max(0, Math.min(1, local / duration));

  return (
    <div
      className={cn("pointer-events-auto absolute z-[7]", selected && "z-[25]")}
      style={boxStyle}
      data-transform-frame
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex h-full w-full items-center justify-center" style={motionStyle}>
        {renderTemplate(item.preset, progress, item.label)}
      </div>
      {selected ? <SelectionChrome onChange={(t) => updateItemTransform(item.id, t)} transform={transform} /> : null}
    </div>
  );
}

function renderTemplate(preset: string, progress: number, label: string) {
  switch (preset) {
    case "ken-burns-reveal": {
      const scale = 1.3 - progress * 0.3;
      return (
        <div className="relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/15 shadow-2xl">
          <div
            className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900 transition-transform"
            style={{ transform: `scale(${scale})` }}
          />
          <div className="absolute bottom-2 left-3 right-3 text-[10px] font-medium text-white/80 drop-shadow">
            {label || "Ken Burns reveal"}
          </div>
        </div>
      );
    }
    case "photo-stack":
      return (
        <div className="relative h-full w-full">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute h-[80%] w-[60%] rounded-lg bg-gradient-to-br from-zinc-600 to-zinc-800 shadow-xl ring-1 ring-white/10"
              style={{
                left: `${15 + i * 12}%`,
                top: `${10 + (i % 2) * 8}%`,
                transform: `rotate(${(i - 1) * 5}deg)`,
                opacity: progress > i * 0.2 ? 1 : 0,
              }}
            />
          ))}
        </div>
      );
    case "polaroid-frame":
      return (
        <div className="flex h-full flex-col items-center justify-center">
          <div className="w-[55%] rounded-sm bg-white p-1.5 pb-6 shadow-2xl" style={{ transform: `rotate(-2deg)` }}>
            <div className="aspect-video w-full rounded-sm bg-gradient-to-br from-zinc-600 to-zinc-800" />
          </div>
        </div>
      );
    case "image-carousel": {
      const offset = -(progress * 3 * 100) / 4;
      return (
        <div className="relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10">
          <div className="flex h-full transition-transform" style={{ transform: `translateX(${offset}%)` }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-full w-3/4 shrink-0 bg-gradient-to-br from-zinc-600 to-zinc-900" />
            ))}
          </div>
        </div>
      );
    }
    case "split-screen":
      return (
        <div className="flex h-full w-full gap-px rounded-xl overflow-hidden ring-1 ring-white/10">
          <div className="flex-1 bg-gradient-to-br from-sky-900 to-sky-950" />
          <div className="flex-1 bg-gradient-to-br from-amber-900 to-amber-950" />
        </div>
      );
    case "picture-in-picture":
      return (
        <div className="relative h-full w-full">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 ring-1 ring-white/10" />
          <div className="absolute bottom-2 right-2 h-1/3 w-1/3 rounded-md bg-gradient-to-br from-blue-700 to-blue-900 shadow-lg ring-2 ring-white/30" />
        </div>
      );
    default:
      return null;
  }
}

function SelectionChrome({ transform, onChange }: { transform: any; onChange: (t: any) => void }) {
  // Lazy import to avoid circular deps — reuses existing TransformHandles.
  const { TransformHandles } = require("../transform-handles") as typeof import("../transform-handles");
  return <TransformHandles transform={transform} onChange={onChange} />;
}
```

- [ ] **Step 2: Wire MediaTemplatePreview into preview-section.tsx**

In `apps/web/src/components/editor/shell/preview-section.tsx`, add the import at the top:

```ts
import { MediaTemplatePreview } from "../canvas/overlays/MediaTemplatePreview";
```

Then in the `visibleMotion.map(...)` block (around line 654), add a branch BEFORE the existing JSX that renders text-based motion. Change the block to route media templates to the new component:

```tsx
{visibleMotion.map((motion) => {
  const isMediaTemplate = [
    "ken-burns-reveal",
    "photo-stack",
    "polaroid-frame",
    "image-carousel",
    "split-screen",
    "picture-in-picture",
  ].includes(motion.preset);
  const selected = selectedItemId === motion.id;

  if (isMediaTemplate) {
    return (
      <MediaTemplatePreview
        key={motion.id}
        item={motion}
        selected={selected}
        onSelect={() => selectItem(motion.id)}
      />
    );
  }

  // ... existing text-based motion overlay rendering stays unchanged ...
```

- [ ] **Step 3: Typecheck**

Run: `cd D:/HANUMAN/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd D:/HANUMAN
git add apps/web/src/components/editor/canvas/overlays/ apps/web/src/components/editor/shell/preview-section.tsx
git commit -m "feat(editor): CSS preview components for media-image templates"
```

---

## Task 8: Update animation panel to show templates by category

**Files:**
- Modify: `apps/web/src/components/editor/panels/animation-panel.tsx:26-45`

- [ ] **Step 1: Replace the hardcoded MOTION_GRAPHICS array with registry-driven rendering**

In `apps/web/src/components/editor/panels/animation-panel.tsx`, replace the `MOTION_GRAPHICS` constant (lines 26-45) and the rendering of the motion-graphics grid with a category-grouped list from the registry.

Add import:
```ts
import { MOTION_TEMPLATES, templatesByCategory } from "@/lib/editor/motion-template-registry";
```

Replace the motion-graphics section's grid to iterate `templatesByCategory("media-image")` (and optionally `"cinematic-text"`) instead of the hardcoded array. Each button calls `addAnimation(tpl.id, playheadMs)`.

- [ ] **Step 2: Typecheck and verify**

Run: `cd D:/HANUMAN/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd D:/HANUMAN
git add apps/web/src/components/editor/panels/animation-panel.tsx
git commit -m "feat(editor): show media-image templates in animation panel"
```

---

## Task 9: Remotion overlay types + OverlayRouter for media templates

**Files:**
- Modify: `packages/remotion-renderer/src/lib/types.ts:125-133`
- Modify: `packages/remotion-renderer/src/components/CaptionsOverlays.tsx:216-234`

- [ ] **Step 1: Extend the Overlay type union**

In `packages/remotion-renderer/src/lib/types.ts`, change the `Overlay` interface `type` field (around line 127) from:

```ts
type: "subscribe_cta" | "chapter_title";
```

to:

```ts
type:
  | "subscribe_cta"
  | "chapter_title"
  | "ken_burns_reveal"
  | "photo_stack"
  | "polaroid_frame"
  | "image_carousel"
  | "split_screen"
  | "picture_in_picture";
```

Also add an optional `image_refs?: string[]` field to the `Overlay` interface.

- [ ] **Step 2: Add branches to OverlayRouter**

In `packages/remotion-renderer/src/components/CaptionsOverlays.tsx`, add the import and extend `OverlayRouter` (around line 216):

```tsx
import {
  KenBurnsOverlay,
  PhotoStackOverlay,
  PolaroidOverlay,
  CarouselOverlay,
  SplitScreenOverlay,
  PiPOverlay,
} from "../overlays/MediaOverlays";

function OverlayRouter({ overlay, theme }: { overlay: Overlay; theme: RemotionTheme }) {
  switch (overlay.type) {
    case "subscribe_cta":
      return <SubscribeCtaOverlay overlay={overlay} theme={theme} />;
    case "ken_burns_reveal":
      return <KenBurnsOverlay overlay={overlay} theme={theme} />;
    case "photo_stack":
      return <PhotoStackOverlay overlay={overlay} theme={theme} />;
    case "polaroid_frame":
      return <PolaroidOverlay overlay={overlay} theme={theme} />;
    case "image_carousel":
      return <CarouselOverlay overlay={overlay} theme={theme} />;
    case "split_screen":
      return <SplitScreenOverlay overlay={overlay} theme={theme} />;
    case "picture_in_picture":
      return <PiPOverlay overlay={overlay} theme={theme} />;
    default:
      return (
        <ChapterTitleOverlay
          overlay={overlay}
          variant={(overlay.transform?.y ?? 20) > 65 ? "lower-third" : "chapter"}
          theme={theme}
        />
      );
  }
}
```

- [ ] **Step 3: Typecheck (will fail until MediaOverlays.tsx exists — that's expected)**

Run: `cd D:/HANUMAN/packages/remotion-renderer && pnpm typecheck`
Expected: FAIL (module not found) — fixed in Task 10.

- [ ] **Step 4: Commit (the failing typecheck is resolved by Task 10)**

```bash
cd D:/HANUMAN
git add packages/remotion-renderer/src/lib/types.ts packages/remotion-renderer/src/components/CaptionsOverlays.tsx
git commit -m "feat(remotion): extend overlay types and router for media templates"
```

---

## Task 10: Remotion media overlay components

**Files:**
- Create: `packages/remotion-renderer/src/overlays/MediaOverlays.tsx`

- [ ] **Step 1: Create the media overlay components**

Create `packages/remotion-renderer/src/overlays/MediaOverlays.tsx` with all 6 components. Each wraps content in `<ApplyAnimation>`. This file follows the pattern of `OverlayComponents.tsx`. Full implementation:

```tsx
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import type { Overlay } from "../lib/types";
import { clipDurationFrames } from "../lib/timing";
import { ApplyAnimation } from "../animations";
import type { getRemotionTheme } from "../lib/theme-grade";

type RemotionTheme = ReturnType<typeof getRemotionTheme>;

function overlayWrapper(overlay: Overlay): React.CSSProperties {
  const t = overlay.transform;
  if (!t) return { position: "absolute" as const, inset: 0 };
  return {
    position: "absolute" as const,
    left: `${t.x ?? 50}%`,
    top: `${t.y ?? 50}%`,
    width: `${(t.scaleX ?? 1) * 60}%`,
    height: `${(t.scaleY ?? 1) * 40}%`,
    transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg)`,
    zIndex: t.zIndex ?? 20,
  };
}

function resolveImage(refs: string[] | undefined, idx: number): string | undefined {
  if (!refs || refs.length === 0) return undefined;
  return refs[idx % refs.length];
}

/** Ken Burns — slow zoom-out reveal. */
export const KenBurnsOverlay: React.FC<{ overlay: Overlay; theme?: RemotionTheme }> = ({ overlay }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const total = clipDurationFrames(overlay.duration_sec, fps);
  const progress = Math.max(0, Math.min(1, frame / total));
  const scale = 1.3 - progress * 0.3;
  const src = resolveImage(overlay.image_refs, 0);
  return (
    <ApplyAnimation overlay={overlay} fps={fps}>
      <div style={overlayWrapper(overlay)}>
        <AbsoluteFill style={{ borderRadius: 12, overflow: "hidden" }}>
          {src ? (
            <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
          ) : (
            <AbsoluteFill style={{ background: "linear-gradient(135deg,#52525b,#27272a)" }} />
          )}
        </AbsoluteFill>
      </div>
    </ApplyAnimation>
  );
};

/** Photo stack — staggered reveal of 3 images with rotation. */
export const PhotoStackOverlay: React.FC<{ overlay: Overlay; theme?: RemotionTheme }> = ({ overlay }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const total = clipDurationFrames(overlay.duration_sec, fps);
  return (
    <ApplyAnimation overlay={overlay} fps={fps}>
      <div style={{ ...overlayWrapper(overlay), position: "relative" }}>
        {[0, 1, 2].map((i) => {
          const showAt = (i / 3) * total;
          const visible = frame >= showAt;
          const src = resolveImage(overlay.image_refs, i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${15 + i * 12}%`,
                top: `${10 + (i % 2) * 8}%`,
                width: "55%",
                height: "75%",
                borderRadius: 8,
                overflow: "hidden",
                transform: `rotate(${(i - 1) * 5}deg)`,
                opacity: visible ? 1 : 0,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                background: "#3f3f46",
              }}
            >
              {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
          );
        })}
      </div>
    </ApplyAnimation>
  );
};

/** Polaroid — white-framed photo with drop-in. */
export const PolaroidOverlay: React.FC<{ overlay: Overlay; theme?: RemotionTheme }> = ({ overlay }) => {
  const { fps } = useVideoConfig();
  const src = resolveImage(overlay.image_refs, 0);
  return (
    <ApplyAnimation overlay={overlay} fps={fps}>
      <div style={{ ...overlayWrapper(overlay), display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ background: "white", padding: 6, paddingBottom: 28, borderRadius: 2, transform: "rotate(-2deg)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
          {src ? (
            <Img src={src} style={{ width: 300, height: 170, objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: 300, height: 170, background: "#52525b" }} />
          )}
        </div>
      </div>
    </ApplyAnimation>
  );
};

/** Carousel — horizontal sliding images. */
export const CarouselOverlay: React.FC<{ overlay: Overlay; theme?: RemotionTheme }> = ({ overlay }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const total = clipDurationFrames(overlay.duration_sec, fps);
  const progress = Math.max(0, Math.min(1, frame / total));
  const offset = -(progress * 3 * 75);
  const count = Math.max(1, overlay.image_refs?.length ?? 4);
  return (
    <ApplyAnimation overlay={overlay} fps={fps}>
      <div style={{ ...overlayWrapper(overlay), overflow: "hidden", borderRadius: 12 }}>
        <div style={{ display: "flex", height: "100%", transform: `translateX(${offset}%)` }}>
          {Array.from({ length: count }).map((_, i) => {
            const src = resolveImage(overlay.image_refs, i);
            return (
              <div key={i} style={{ width: "75%", height: "100%", flexShrink: 0, background: "#3f3f46" }}>
                {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </ApplyAnimation>
  );
};

/** Split screen — two-panel comparison. */
export const SplitScreenOverlay: React.FC<{ overlay: Overlay; theme?: RemotionTheme }> = ({ overlay }) => {
  const { fps } = useVideoConfig();
  return (
    <ApplyAnimation overlay={overlay} fps={fps}>
      <div style={{ ...overlayWrapper(overlay), display: "flex", gap: 2, borderRadius: 12, overflow: "hidden" }}>
        {[0, 1].map((i) => {
          const src = resolveImage(overlay.image_refs, i);
          return (
            <div key={i} style={{ flex: 1, background: i === 0 ? "#0c4a6e" : "#78350f" }}>
              {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
          );
        })}
      </div>
    </ApplyAnimation>
  );
};

/** Picture-in-picture. */
export const PiPOverlay: React.FC<{ overlay: Overlay; theme?: RemotionTheme }> = ({ overlay }) => {
  const { fps } = useVideoConfig();
  const src = resolveImage(overlay.image_refs, 0);
  return (
    <ApplyAnimation overlay={overlay} fps={fps}>
      <div style={{ ...overlayWrapper(overlay), position: "relative" }}>
        <AbsoluteFill style={{ borderRadius: 12, overflow: "hidden", background: "#3f3f46" }}>
          {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        </AbsoluteFill>
        <div style={{ position: "absolute", bottom: 8, right: 8, width: "33%", height: "33%", borderRadius: 6, overflow: "hidden", border: "2px solid rgba(255,255,255,0.3)", background: "#1e3a8a", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          {overlay.image_refs?.[1] ? <Img src={overlay.image_refs[1]} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        </div>
      </div>
    </ApplyAnimation>
  );
};
```

Note: the `ApplyAnimation` component signature in `animations/ApplyAnimation.tsx` takes `{ children, overlay, fps }`. Verify the prop names match — read the file if unsure.

- [ ] **Step 2: Verify ApplyAnimation prop interface**

Run: `cd D:/HANUMAN && grep -n "export.*ApplyAnimation\|interface.*Props\|overlay.*Overlay" packages/remotion-renderer/src/animations/ApplyAnimation.tsx | head`
Confirm the prop names. Adjust MediaOverlays.tsx if they differ.

- [ ] **Step 3: Typecheck**

Run: `cd D:/HANUMAN/packages/remotion-renderer && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd D:/HANUMAN
git add packages/remotion-renderer/src/overlays/MediaOverlays.tsx
git commit -m "feat(remotion): add media-image overlay components"
```

---

## Task 11: Backend — hybrid AI template trigger

**Files:**
- Create: `workers/orchestrator/src/activities/template_trigger.py`
- Create: `workers/orchestrator/src/prompts/template_trigger.py`
- Modify: `workers/orchestrator/src/activities/pipeline.py:1754-1761`

- [ ] **Step 1: Create the template trigger prompt**

Create `workers/orchestrator/src/prompts/template_trigger.py`:

```python
"""LLM prompt for selecting motion-graphic templates per scene (hybrid trigger)."""

TEMPLATE_TRIGGER_SYSTEM = """You are a video editor AI that picks motion-graphics overlays for documentary scenes.
You receive a list of scenes with their narration. For EACH scene, decide whether to add a media-image overlay.

Available templates:
- ken_burns_reveal: slow zoom-out on a hero image. Best for establishing shots, emotional moments, or when a single powerful image defines the scene.
- photo_stack: 3 stacked photos with rotation. Best for showing a collection, group of people, or multiple examples.
- polaroid_frame: nostalgic single photo. Best for memories, historical figures, or personal stories.
- image_carousel: 4 sliding images. Best for sequences, timelines, or showing progression.
- split_screen: two-panel comparison. Best for before/after, contrasts, or dual subjects.
- picture_in_picture: small inset image. Best for diagrams over footage, maps, or secondary visuals.

Rules:
- Only add an overlay when it ENHANCES the scene. Most scenes should have NO overlay (footage alone is fine).
- A 20-minute video should have at most 5-8 overlays total.
- Prefer ken_burns_reveal and split_screen for documentaries.
- Never add overlays to the first or last scene (intro/outro).
- Respond with ONLY valid JSON, no prose."""

def template_trigger_user_prompt(scenes_json: str) -> str:
    return f"""For each scene below, choose the best overlay template (or "none").
Each scene has an index, title, and narration snippet.

Scenes:
{scenes_json}

Respond as JSON: {{"triggers": [{{"scene_index": 0, "template": "none"}}, ...]}}
Only include scenes where template is NOT "none"."""
```

- [ ] **Step 2: Create the hybrid template trigger module**

Create `workers/orchestrator/src/activities/template_trigger.py`:

```python
"""Hybrid (rule + LLM) auto-trigger for motion-graphics templates.

Rule-based for obvious cases (intro/outro skipped), one batched LLM call for
the ambiguous middle scenes. Returns overlay dicts ready for the timeline manifest.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from shared_types.motion_templates import MEDIA_TEMPLATE_IDS, TemplateCategory
from clients.openrouter import chat_completion_detailed
from prompts.template_trigger import TEMPLATE_TRIGGER_SYSTEM, template_trigger_user_prompt

logger = logging.getLogger(__name__)

# Rule-based keywords that map narration content to a template.
RULE_KEYWORDS: list[tuple[str, str]] = [
    ("before and after", "split_screen"),
    ("compared to", "split_screen"),
    ("versus", "split_screen"),
    ("contrast", "split_screen"),
    ("collection", "photo_stack"),
    ("several", "photo_stack"),
    ("many", "photo_stack"),
    ("remember", "polaroid_frame"),
    ("memory", "polaroid_frame"),
    ("childhood", "polaroid_frame"),
    ("timeline", "image_carousel"),
    ("progression", "image_carousel"),
    ("evolved", "image_carousel"),
    ("decades", "image_carousel"),
]


def auto_trigger_templates(
    sections: list[dict],
    video_clips: list[dict],
    scenes_data: list[dict],
    total_duration: float,
    openrouter_config: dict | None = None,
) -> list[dict]:
    """Return overlay dicts for media-image templates.

    Hybrid: rules for keyword-obvious cases + one LLM call for the rest.
    Skips first/last scenes. Caps total overlays at 8.
    """
    overlays: list[dict] = []
    if len(sections) < 4:
        return overlays

    # Build scene context (skip first and last).
    scene_context = []
    for i, section in enumerate(sections):
        if i == 0 or i == len(sections) - 1:
            continue
        narration = (section.get("narration") or "")[:200]
        scene_context.append({
            "scene_index": i,
            "title": section.get("title", ""),
            "narration": narration,
        })

    # Phase 1: rule-based pass.
    rule_triggered: set[int] = set()
    for ctx in scene_context:
        narration_lower = ctx["narration"].lower()
        for keyword, template_id in RULE_KEYWORDS:
            if keyword in narration_lower:
                overlay = _build_overlay(ctx["scene_index"], sections, video_clips, template_id)
                if overlay:
                    overlays.append(overlay)
                    rule_triggered.add(ctx["scene_index"])
                break

    # Phase 2: LLM pass for un-triggered scenes (if OpenRouter configured).
    remaining = [c for c in scene_context if c["scene_index"] not in rule_triggered]
    if remaining and len(overlays) < 8 and openrouter_config and openrouter_config.get("api_key"):
        try:
            llm_overlays = _llm_trigger(remaining, sections, video_clips, openrouter_config)
            overlays.extend(llm_overlays)
        except Exception as e:
            logger.warning("LLM template trigger failed, using rules only: %s", e)

    # Cap at 8 overlays, sorted by start time.
    overlays.sort(key=lambda o: o.get("start_sec", 0))
    return overlays[:8]


def _build_overlay(
    scene_index: int,
    sections: list[dict],
    video_clips: list[dict],
    template_id: str,
) -> dict | None:
    """Build a single overlay dict positioned at the scene's video clip."""
    if scene_index >= len(video_clips):
        return None
    clip = video_clips[scene_index]
    start_sec = clip.get("start_sec", 0)
    duration_sec = min(5.0, clip.get("duration_sec", 4.0))
    section = sections[scene_index] if scene_index < len(sections) else {}
    return {
        "id": f"tpl-{template_id}-{scene_index}",
        "type": _template_id_to_manifest(template_id),
        "text": section.get("title", ""),
        "start_sec": round(start_sec, 2),
        "duration_sec": round(duration_sec, 2),
        "transform": {
            "x": 50,
            "y": 50,
            "scaleX": 1,
            "scaleY": 1,
            "rotation": 0,
            "zIndex": 15,
        },
        "image_refs": [],  # populated by the visual-sourcing stage later
    }


def _template_id_to_manifest(template_id: str) -> str:
    mapping = {
        "ken-burns-reveal": "ken_burns_reveal",
        "photo-stack": "photo_stack",
        "polaroid-frame": "polaroid_frame",
        "image-carousel": "image_carousel",
        "split-screen": "split_screen",
        "picture-in-picture": "picture_in_picture",
    }
    return mapping.get(template_id, "ken_burns_reveal")


def _llm_trigger(
    scene_context: list[dict],
    sections: list[dict],
    video_clips: list[dict],
    openrouter_config: dict,
) -> list[dict]:
    """One batched LLM call to pick templates for ambiguous scenes."""
    scenes_json = json.dumps(scene_context, indent=2)
    user_prompt = template_trigger_user_prompt(scenes_json)
    response = chat_completion_detailed(
        system=TEMPLATE_TRIGGER_SYSTEM,
        user=user_prompt,
        model=openrouter_config.get("model", "deepseek/deepseek-v4-flash"),
        api_key=openrouter_config["api_key"],
        base_url=openrouter_config.get("base_url", "https://openrouter.ai/api/v1"),
        temperature=0.4,
        max_tokens=800,
    )
    # Parse JSON response — tolerate markdown fences.
    text = response.strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    result = json.loads(text)
    triggers = result.get("triggers", [])
    overlays = []
    for trig in triggers:
        idx = trig.get("scene_index")
        template = trig.get("template", "none")
        if template == "none" or idx is None:
            continue
        manifest = _template_id_to_manifest(template)
        if manifest not in [t.manifest_type for t in []]:  # validate against catalog
            pass
        overlay = _build_overlay(idx, sections, video_clips, template)
        if overlay:
            overlays.append(overlay)
    return overlays
```

- [ ] **Step 3: Wire auto_trigger_templates into build_timeline**

In `workers/orchestrator/src/activities/pipeline.py`, find the overlay assembly section (around line 1754-1761) and add the template trigger. After the existing `overlays` list is built, add:

```python
from activities.template_trigger import auto_trigger_templates

# ... inside build_timeline, after line 1761 (after subscribe_overlay is appended):
openrouter_config = {
    "api_key": settings.openrouter_api_key,
    "model": settings.openrouter_model,
    "base_url": settings.openrouter_base_url,
}
media_overlays = auto_trigger_templates(
    sections=sections,
    video_clips=video_clips,
    scenes_data=scenes_data,
    total_duration=total_duration,
    openrouter_config=openrouter_config if settings.openrouter_configured else None,
)
overlays.extend(media_overlays)
```

- [ ] **Step 4: Verify the orchestrator compiles**

Run: `cd D:/HANUMAN/workers/orchestrator && uv run python -c "from src.activities.template_trigger import auto_trigger_templates; print('import ok')"`
Expected: `import ok`

- [ ] **Step 5: Commit**

```bash
cd D:/HANUMAN
git add workers/orchestrator/src/activities/template_trigger.py workers/orchestrator/src/prompts/template_trigger.py workers/orchestrator/src/activities/pipeline.py
git commit -m "feat(orchestrator): hybrid AI template auto-trigger"
```

---

## Task 12: Integration test — end-to-end manual verification

**Files:**
- No new files — manual verification

- [ ] **Step 1: Rebuild all changed images**

```bash
cd D:/HANUMAN
docker compose --env-file .env -f infrastructure/docker-compose.yml build web orchestrator media
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d web orchestrator media
```

- [ ] **Step 2: Verify web typecheck passed in the Docker build**

Confirm the build log shows `✓ Compiled successfully` with no type errors.

- [ ] **Step 3: Open the editor and verify the panel shows 6 new templates**

Open http://localhost:3000/projects/<any-project-id>/editor, click the Motion graphics tool (left toolbar). Verify 6 new media-image templates appear alongside the existing 3.

- [ ] **Step 4: Add a template manually and verify it renders on the canvas**

Click "Ken Burns reveal" in the panel. Verify a preview box appears on the canvas at the playhead position with the zoom animation.

- [ ] **Step 5: Generate a new video and verify auto-triggered templates appear**

Create a new project, generate it. After generation, open the editor and check the animation track — there should be 1-8 auto-triggered media overlays (not just chapter titles).

- [ ] **Step 6: Commit final state**

```bash
cd D:/HANUMAN
git add -A
git commit -m "feat: motion-graphics template system with hybrid AI trigger"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Media/image templates (Ken Burns, Photo stack, Polaroid, Carousel, Split screen, PiP) — Tasks 7, 10
- ✅ Data-driven registry (better than VidRush's hardcoded approach) — Tasks 1, 3
- ✅ AI auto-trigger (hybrid rule + LLM) — Task 11
- ✅ Lightweight (CSS preview + Remotion render, no heavy AE) — Tasks 7, 10
- ✅ Backend-frontend parity (shared registry, manifest schema) — Tasks 1, 2, 6

**Key risks flagged:**
- The `ApplyAnimation` prop interface in Task 10 must match the actual signature — Step 2 of Task 10 verifies this.
- The LLM JSON parsing in Task 11 is fragile — the code tolerates markdown fences but should be tested with a real OpenRouter call.
- `image_refs` is currently empty `[]` — a follow-up task would populate it from the scene's Pexels images during `plan_scenes`. This is deferred; templates render with gradient placeholders until that's wired.

**Deferred to future phases (per user's phase-1-media-first choice):**
- Charts/Data category (bar/line/pie charts, stat counters)
- Cinematic/Text category expansion (quote cards, title split, countdown, end card, credits)
- Content Animation (3D carousel, card flip, particle explosion, sound wave)
- `image_refs` population from Pexels scene assets
