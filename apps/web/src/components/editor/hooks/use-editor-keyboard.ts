"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/lib/editor/store";

const NUDGE_MS = 100;
const NUDGE_FINE_MS = 33;

export function useEditorKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      const store = useEditorStore.getState();

      if (e.code === "Space") {
        e.preventDefault();
        store.setPlaying(!store.ui.isPlaying);
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      }
      if ((mod && e.shiftKey && e.key.toLowerCase() === "z") || (mod && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        store.redo();
      }
      if (e.key === "Escape") {
        store.toggleToolPanel(false);
        store.setRightPanelOpen(false);
        store.selectItem(null);
        store.selectTransition(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedItemId, selectedTransitionId } = store.ui;
        if (selectedItemId) {
          e.preventDefault();
          store.deleteItem(selectedItemId);
          return;
        }
        if (selectedTransitionId) {
          e.preventDefault();
          store.deleteTransition(selectedTransitionId);
        }
      }
      if (e.key.toLowerCase() === "s" && !mod) {
        const id = store.ui.selectedItemId;
        if (id) {
          e.preventDefault();
          store.splitItem(id, store.ui.playheadMs);
        }
      }
      if (mod && e.key.toLowerCase() === "d") {
        const id = store.ui.selectedItemId;
        if (id) {
          e.preventDefault();
          store.duplicateItem(id);
        }
      }
      if (e.key === "]" && store.ui.selectedItemId) {
        e.preventDefault();
        store.bringItemToFront(store.ui.selectedItemId);
      }
      if (e.key === "[" && store.ui.selectedItemId) {
        e.preventDefault();
        store.sendItemToBack(store.ui.selectedItemId);
      }
      if (e.key === "Home") {
        e.preventDefault();
        store.setPlaying(false);
        store.setPlayhead(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        store.setPlaying(false);
        store.setPlayhead(store.timeline.durationMs);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        // Pause before seek — seeking while playing causes narration restart / stutter (feels like repeat).
        if (store.ui.isPlaying) store.setPlaying(false);
        const step = e.shiftKey ? NUDGE_FINE_MS : NUDGE_MS;
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const next = Math.max(
          0,
          Math.min(store.timeline.durationMs, store.ui.playheadMs + dir * step),
        );
        store.setPlayhead(next);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
