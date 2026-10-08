"use client";

import { useEffect } from "react";
import { useEditorStore, endGestureHistory } from "@/lib/editor/store";
import { useTemplateLayerSelection } from "@/lib/editor/template-layer-selection";
import { removeSelectedImageBackground } from "@/lib/editor/remove-image-background";

/** Keep existing tools and persisted layer edits connected to the native canvas. */
export function useNativeTemplateEvents() {
  useEffect(() => {
    let disposeDrag: (() => void) | undefined;
    const select = (event: Event) => {
      const { clipId, layer } = (event as CustomEvent).detail ?? {};
      const state = useEditorStore.getState(); const track = state.timeline.tracks.find(t => t.items.some(item => item.id === clipId));
      if (!track || track.locked) { event.preventDefault(); return; }
      state.selectItem(clipId); useTemplateLayerSelection.getState().select(clipId, layer?.id ? layer : null);
      state.setPlaying(false); state.setActiveTool("text"); state.toggleToolPanel(true);
    };
    const edit = (event: Event) => {
      const { clipId, layerId, patch } = (event as CustomEvent).detail ?? {};
      const state = useEditorStore.getState(); const track = state.timeline.tracks.find(t => t.items.some(item => item.id === clipId)); const item = track?.items.find(item => item.id === clipId);
      if (!track || track.locked || item?.type !== "video" || !item.motionTemplate || typeof layerId !== "string") return;
      state.updateClipMotionTemplate(clipId, { ...item.motionTemplate, layer_edits: { ...item.motionTemplate.layer_edits, [layerId]: { ...item.motionTemplate.layer_edits?.[layerId], ...patch } } });
      endGestureHistory();
    };
    const replace = (event: Event) => {
      const { clipId } = (event as CustomEvent).detail ?? {}; const state = useEditorStore.getState();
      const track = state.timeline.tracks.find(t => t.items.some(item => item.id === clipId));
      if (!track || track.locked) return;
      state.selectItem(clipId); state.setPlaying(false); state.setReplaceMediaOpen(true);
    };
    const cutout = (event: Event) => { void removeSelectedImageBackground((event as CustomEvent).detail?.clipId); };
    const drag = (event: Event) => {
      const { clipId, clientX, clientY, pointerId } = (event as CustomEvent).detail ?? {};
      const state = useEditorStore.getState(); const track = state.timeline.tracks.find(t => t.items.some(item => item.id === clipId)); const item = track?.items.find(item => item.id === clipId);
      const stage = document.querySelector("[data-preview-stage]")?.getBoundingClientRect();
      if (!track || track.locked || item?.type !== "video" || !stage?.width || !stage.height) return;
      disposeDrag?.(); state.selectItem(clipId); state.setPlaying(false); useTemplateLayerSelection.getState().select(clipId, null);
      const original = { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0, ...item.transform };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        let x = original.x + (e.clientX - clientX) / stage.width * 100; let y = original.y + (e.clientY - clientY) / stage.height * 100;
        if (!e.altKey) { if (Math.abs(x - 50) * stage.width / 100 <= 6) x = 50; if (Math.abs(y - 50) * stage.height / 100 <= 6) y = 50; }
        useEditorStore.getState().updateItemTransform(clipId, { ...original, x, y });
      };
      const finish = (e: PointerEvent) => { if (e.pointerId === pointerId) { disposeDrag?.(); endGestureHistory(); } };
      disposeDrag = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
    };
    const handlers: Array<[string, (event: Event) => void]> = [["hanuman-template-layer", select], ["hanuman-template-layer-edit", edit], ["hanuman-template-replace", replace], ["hanuman-template-cutout", cutout], ["hanuman-template-drag", drag]];
    handlers.forEach(([name, handler]) => window.addEventListener(name, handler));
    return () => { disposeDrag?.(); handlers.forEach(([name, handler]) => window.removeEventListener(name, handler)); };
  }, []);
}
