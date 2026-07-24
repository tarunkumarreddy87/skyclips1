/**
 * Map timeline.v1 transition types → @remotion/transitions presentations.
 * Duration always comes from timeline `duration_sec` via secToFrames at call site.
 */

import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { slide } from "@remotion/transitions/slide";
import { iris } from "@remotion/transitions/iris";
import type { TransitionPresentation } from "@remotion/transitions";
import type { TransitionType } from "../lib/types";
import { filmBurnPresentation } from "./film-burn";
import { glitchPresentation } from "./glitch";
import { zoomPresentation } from "./zoom";
import { pixelizePresentation } from "./pixelize";

export type TransitionMappingKind = "builtin" | "custom" | "cut" | "approx";

export interface TransitionMapping {
  kind: TransitionMappingKind;
  note: string;
  presentation: (() => TransitionPresentation<Record<string, unknown>>) | null;
}

const cast = (p: TransitionPresentation<Record<string, unknown>>) => p;

export const TRANSITION_MAPPING_TABLE: Record<TransitionType, TransitionMapping> = {
  cut: { kind: "cut", note: "Hard cut", presentation: null },
  fade: {
    kind: "builtin",
    note: "fade()",
    presentation: () => cast(fade() as TransitionPresentation<Record<string, unknown>>),
  },
  dissolve: {
    kind: "builtin",
    note: "fade()",
    presentation: () => cast(fade() as TransitionPresentation<Record<string, unknown>>),
  },
  wipeleft: {
    kind: "builtin",
    note: "wipe from-left",
    presentation: () =>
      cast(wipe({ direction: "from-left" }) as TransitionPresentation<Record<string, unknown>>),
  },
  wiperight: {
    kind: "builtin",
    note: "wipe from-right",
    presentation: () =>
      cast(wipe({ direction: "from-right" }) as TransitionPresentation<Record<string, unknown>>),
  },
  wipeup: {
    kind: "builtin",
    note: "wipe from-bottom",
    presentation: () =>
      cast(wipe({ direction: "from-bottom" }) as TransitionPresentation<Record<string, unknown>>),
  },
  wipedown: {
    kind: "builtin",
    note: "wipe from-top",
    presentation: () =>
      cast(wipe({ direction: "from-top" }) as TransitionPresentation<Record<string, unknown>>),
  },
  slide: {
    kind: "builtin",
    note: "slide from-right",
    presentation: () =>
      cast(slide({ direction: "from-right" }) as TransitionPresentation<Record<string, unknown>>),
  },
  slideleft: {
    kind: "builtin",
    note: "slide from-left",
    presentation: () =>
      cast(slide({ direction: "from-left" }) as TransitionPresentation<Record<string, unknown>>),
  },
  slideright: {
    kind: "builtin",
    note: "slide from-right",
    presentation: () =>
      cast(slide({ direction: "from-right" }) as TransitionPresentation<Record<string, unknown>>),
  },
  slideup: {
    kind: "builtin",
    note: "slide from-bottom",
    presentation: () =>
      cast(slide({ direction: "from-bottom" }) as TransitionPresentation<Record<string, unknown>>),
  },
  slidedown: {
    kind: "builtin",
    note: "slide from-top",
    presentation: () =>
      cast(slide({ direction: "from-top" }) as TransitionPresentation<Record<string, unknown>>),
  },
  "slide-pan": {
    kind: "builtin",
    note: "slide from-left",
    presentation: () =>
      cast(slide({ direction: "from-left" }) as TransitionPresentation<Record<string, unknown>>),
  },
  circleopen: {
    kind: "builtin",
    note: "iris()",
    presentation: () =>
      cast(iris({ width: 1920, height: 1080 }) as unknown as TransitionPresentation<Record<string, unknown>>),
  },
  circleclose: {
    kind: "approx",
    note: "iris()",
    presentation: () =>
      cast(iris({ width: 1920, height: 1080 }) as unknown as TransitionPresentation<Record<string, unknown>>),
  },
  zoom: {
    kind: "custom",
    note: "zoomPresentation()",
    presentation: () => cast(zoomPresentation()),
  },
  pixelize: {
    kind: "custom",
    note: "pixelizePresentation()",
    presentation: () => cast(pixelizePresentation()),
  },
  "film-burn": {
    kind: "custom",
    note: "filmBurnPresentation()",
    presentation: () => cast(filmBurnPresentation()),
  },
  glitch: {
    kind: "custom",
    note: "glitchPresentation()",
    presentation: () => cast(glitchPresentation()),
  },
};

export function presentationForType(
  type: TransitionType,
): TransitionPresentation<Record<string, unknown>> | null {
  const mapping = TRANSITION_MAPPING_TABLE[type] ?? TRANSITION_MAPPING_TABLE.fade;
  if (mapping.kind === "cut" || !mapping.presentation) return null;
  return mapping.presentation();
}
