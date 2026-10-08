import { useEditorStore } from "../store";
import { resolveMediaUrl } from "../media-url";
import { VIDEO_FILTERS, VIDEO_EFFECTS } from "@hanuman/shared-types";
import { TRANSITION_SOUNDS } from "../transition-sounds";
import { SOUND_EFFECTS } from "../sound-effects";
import { useBrandProfileStore } from "@/lib/brand-profiles";

export function buildAgentContext(mentionedItemIds?: string[]) {
  const state = useEditorStore.getState();
  const playhead = state.ui.playheadMs;
  const allItems = state.timeline.tracks.flatMap(track => track.items.map(item => ({
    ...item, locked: track.locked, trackHidden: track.hidden,
  })));
  // Put the selected/current scene first, while retaining distant clip IDs for whole-timeline edits.
  const selectedItemIds = [...new Set(mentionedItemIds ?? (state.ui.selectedItemId ? [state.ui.selectedItemId] : []))].filter(id => allItems.some(item => item.id === id));
  const relevance = (item: typeof allItems[number]) => selectedItemIds.includes(item.id) ? -1e9 : item.startMs <= playhead && item.endMs > playhead ? -1e8 : Math.abs(item.startMs - playhead);
  const items = [...allItems].sort((a, b) => relevance(a) - relevance(b));
  const scenes = allItems.filter(item => item.type === "video" || item.type === "broll").map(clip => ({
    itemId: clip.id, startMs: clip.startMs, endMs: clip.endMs, label: clip.label,
    captions: allItems.filter(item => item.type === "captions" && item.startMs < clip.endMs && item.endMs > clip.startMs)
      .sort((a,b) => a.startMs-b.startMs).map(item => ({itemId:item.id, text: "text" in item ? item.text : "", startMs:Math.max(item.startMs,clip.startMs), endMs:Math.min(item.endMs,clip.endMs)})),
  }));
  const transitions = state.timeline.transitions.map(t => ({ id: t.id, afterItemId: t.afterItemId, type: t.transitionType, durationMs: t.durationMs, enabled: t.enabled, sfxMuted: t.sfxMuted }));
  return {
    profileId: useBrandProfileStore.getState().activeProfileId,
    playheadMs: Math.round(playhead),
    selectedItemId: selectedItemIds[0] || null,
    selectedItemIds,
    selectedTransitionId: state.ui.selectedTransitionId,
    durationMs: Math.round(state.timeline.durationMs),
    summary: `Project: ${state.project.title}. ${state.project.language}. ${state.project.format}. ${allItems.length} timeline items; all ${items.length} included.`,
    items,
    scenes,
    transitions,
    settings: state.timeline.settings,
    filters: VIDEO_FILTERS.map(f => ({ id: f.id, name: f.name })),
    effects: VIDEO_EFFECTS,
    soundLibrary: [...TRANSITION_SOUNDS.map(s => ({ label: s.label, url: `/sfx/${s.file}`, durationMs: Math.round(s.durationSec * 1000), volume: s.gain })), ...SOUND_EFFECTS.map(s => ({ label: s.label, url: undefined, preset: s.id, durationMs: s.durationMs, volume: 0.25 }))],
    assets: state.assets.map(a => ({ id: a.id, label: a.label, mediaType: a.mediaType, url: resolveMediaUrl(a.url), thumbnailUrl: resolveMediaUrl(a.thumbnailUrl) })),
  };
}
