import { create } from "zustand";
import type { HtmlLayerSelection } from "@hanuman/video-engine/preview";

/** Ephemeral canvas selection, separate from the saved layer edits. */
export const useTemplateLayerSelection = create<{
  clipId: string | null; layer: HtmlLayerSelection | null;
  select: (clipId: string, layer: HtmlLayerSelection | null) => void;
}>(set => ({clipId: null, layer: null, select: (clipId, layer) => set({clipId, layer})}));
