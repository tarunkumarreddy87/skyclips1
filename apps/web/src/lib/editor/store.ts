import { create } from "zustand";
import { generateShortId } from "@/lib/id";
import type {
  Asset,
  ClipItem,
  EditorState,
  ElementAnimation,
  ElementTransform,
  FitMode,
  HistorySnapshot,
  LeftTool,
  SaveStatus,
  TimelineItem,
  TimelineSettings,
  TrackType,
  TransitionType,
} from "./types";
import { resolveTransform } from "./transform";
import { loadEditorState } from "./load-editor-state";
import { isEditorLoadError } from "./editor-load-error";
import {
  flushAutosave,
  markEditorFlushed,
  resetAutosaveIdentity,
  resetTimelineRemote,
  restoreSnapshotRemote,
  scheduleAutosave,
} from "./persist";
import { clamp, MAX_ZOOM, MIN_ZOOM } from "./utils";
import { clipsAbut } from "./transition-abut";
import { TRACK_DISPLAY_ORDER, resolveVisibleTracks } from "./timeline-layout";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface EditorUIState {
  loadStatus: LoadStatus;
  loadError: string | null;
  loadErrorCode: string | null;
  canRetryGeneration: boolean;
  projectStatus: string | null;
  activeTool: LeftTool;
  selectedItemId: string | null;
  selectedTransitionId: string | null;
  playheadMs: number;
  /**
   * Live scrub override (timeline needle drag). Remotion reads this for
   * frame-accurate preview while store playhead commits are throttled.
   */
  previewScrubMs: number | null;
  isPlaying: boolean;
  playbackSpeed: number;
  saveStatus: SaveStatus;
  toolPanelOpen: boolean;
  rightPanelOpen: boolean;
  agentPanelOpen: boolean;
  /** Clip IDs mentioned in Editor Agent composer (multi-mention). */
  agentMentionIds: string[];
  /** True while Editor Agent is applying edits (drives timeline busy glow). */
  agentBusy: boolean;
  replaceMediaOpen: boolean;
  infoOpen: boolean;
  supportOpen: boolean;
  mediaSearchQuery: string;
  mediaSourceTab: "stock" | "licensed" | "local" | "url";
  restoreDialogId: string | null;
  resetConfirmOpen: boolean;
  /** Authoritative MP4 duration from last successful render (ms), if known. */
  lastRenderedDurationMs: number | null;
}

interface EditorStore extends EditorState {
  ui: EditorUIState;
  init: (projectId: string) => Promise<void>;
  setActiveTool: (tool: LeftTool) => void;
  selectItem: (itemId: string | null) => void;
  selectTransition: (transitionId: string | null) => void;
  setPlayhead: (ms: number) => void;
  /** Ephemeral scrub position for Remotion (null when not scrubbing). */
  setPreviewScrubMs: (ms: number | null) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setZoom: (zoom: number) => void;
  updateSettings: (patch: Partial<TimelineSettings>) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setInfoOpen: (open: boolean) => void;
  setSupportOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setAgentPanelOpen: (open: boolean) => void;
  toggleAgentPanel: (open?: boolean) => void;
  setAgentBusy: (busy: boolean) => void;
  addAgentMentions: (ids: string[]) => void;
  removeAgentMention: (id: string) => void;
  clearAgentMentions: () => void;
  setReplaceMediaOpen: (open: boolean) => void;
  toggleToolPanel: (open?: boolean) => void;
  setMediaSearch: (query: string) => void;
  setMediaSourceTab: (tab: EditorUIState["mediaSourceTab"]) => void;
  replaceMedia: (itemId: string, assetId: string) => void;
  addAssetFromUrl: (
    url: string,
    itemId: string,
    meta?: { sourceKey?: string; label?: string },
  ) => void;
  moveItem: (itemId: string, startMs: number) => void;
  trimItem: (itemId: string, startMs: number, endMs: number) => void;
  updateTextItem: (
    itemId: string,
    patch: Partial<{
      text: string;
      label: string;
      fontSize: number;
      color: string;
      fontWeight: string;
      alignment: "left" | "center" | "right";
      fontFamily: string;
      stylePreset: string;
      boxWidthPct: number;
    }>,
  ) => void;
  updateAnimationItem: (
    itemId: string,
    patch: Partial<{ label: string; intensity: number; boxWidthPct: number }>,
  ) => void;
  updateTextPosition: (itemId: string, x: number, y: number) => void;
  updateItemTransform: (itemId: string, transform: ElementTransform) => void;
  /**
   * Restore A-roll (video track) clips to full-frame without undo/autosave.
   * Used to heal corrupted transforms from older AbsoluteFill bugs.
   */
  repairArollFullFrameSilent: () => number;
  updateItemAnimation: (itemId: string, animation: ElementAnimation) => void;
  toggleCaptions: (enabled: boolean) => void;
  setTransition: (transitionId: string, type: TransitionType, durationMs?: number) => void;
  deleteTransition: (transitionId: string) => void;
  addTransition: (afterItemId: string, type: TransitionType, durationMs?: number) => string | null;
  deleteItem: (itemId: string) => boolean;
  duplicateItem: (itemId: string) => string | null;
  /** Split clip at absolute timeline ms; returns right-half id or null. */
  splitItem: (itemId: string, atMs: number) => string | null;
  bringItemToFront: (itemId: string) => void;
  sendItemToBack: (itemId: string) => void;
  toggleTrackHidden: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;
  clearTrackItems: (trackId: string) => void;
  /** Move a timeline lane up (−1) or down (+1) in display order. */
  moveTrack: (trackId: string, direction: -1 | 1) => void;
  /** Reorder lanes to match the given track-id sequence (visible rows). */
  reorderTracksByIds: (orderedTrackIds: string[]) => void;
  addCaption: (text: string, startMs?: number, durationMs?: number) => string;
  addMusic: (opts?: {
    label?: string;
    url?: string;
    startMs?: number;
    durationMs?: number;
    volume?: number;
  }) => string;
  addSfx: (opts?: {
    label?: string;
    url?: string;
    startMs?: number;
    durationMs?: number;
    volume?: number;
  }) => string;
  addBroll: (opts?: {
    label?: string;
    url?: string;
    startMs?: number;
    durationMs?: number;
    sourceKey?: string;
    sourceType?: Asset["sourceType"];
  }) => string;
  toggleItemHidden: (itemId: string) => void;
  updateClipFitMode: (itemId: string, fitMode: FitMode) => void;
  updateClipMuted: (itemId: string, muted: boolean) => void;
  updateAudioVolume: (itemId: string, volume: number) => void;
  /** Fade times in ms (preview + export via fadedGain / manifest). */
  updateAudioFades: (itemId: string, fadeInMs: number, fadeOutMs: number) => void;
  addTextOverlay: () => string;
  addAnimation: (preset: string, startMs: number) => string;
  setRestoreDialogId: (id: string | null) => void;
  setResetConfirmOpen: (open: boolean) => void;
  setLastRenderedDurationMs: (ms: number | null) => void;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  resetTimeline: () => Promise<void>;
  flushSave: () => Promise<void>;
  getSelectedItem: () => TimelineItem | null;
  getAsset: (assetId: string) => Asset | undefined;
  markUnsaved: () => void;
  /** Local undo stack (timeline document), separate from remote autosave snapshots. */
  editPast: EditorState["timeline"][];
  editFuture: EditorState["timeline"][];
  undo: () => void;
  redo: () => void;
  beginGestureHistory: () => void;
}

const EMPTY_STATE = {
  project: {
    id: "",
    title: "",
    format: "documentary" as const,
    durationMs: 1,
    status: "editing" as const,
    prompt: "",
    model: "",
    language: "en",
    voice: "",
    brandProfile: "",
    createdAt: "",
    fps: 30,
  },
  timeline: {
    id: "",
    durationMs: 1,
    fps: 30,
    settings: {
      zoom: 8,
      snappingEnabled: true,
      showTransitions: true,
      captionsEnabled: true,
      captionStyle: "bold_static" as const,
      backgroundColor: "#000000",
      backgroundImage: null as string | null,
      overlayDropShadow: true,
      narrationVolume: 100,
      musicVolume: 28,
      sfxVolume: 50,
      // Preview-only; export strips clip audio — default off for honest mix.
      clipAudioVolume: 0,
      previewMuted: false,
      themeId: "standard" as const,
    },
    tracks: [],
    transitions: [],
  },
  assets: [],
  history: [],
  editPast: [] as EditorStore["timeline"][],
  editFuture: [] as EditorStore["timeline"][],
};

function findItem(state: EditorState, itemId: string): TimelineItem | null {
  for (const track of state.timeline.tracks) {
    const item = track.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

function findTrackForItem(
  state: EditorState,
  itemId: string,
): { trackId: string; locked: boolean } | null {
  for (const track of state.timeline.tracks) {
    if (track.items.some((i) => i.id === itemId)) {
      return { trackId: track.id, locked: Boolean(track.locked) };
    }
  }
  return null;
}

function persistHooks(get: () => EditorStore, set: (partial: Partial<EditorStore>) => void) {
  const setSaveStatus = (status: SaveStatus) =>
    set({ ui: { ...get().ui, saveStatus: status } });
  const setHistory = (history: HistorySnapshot[]) => set({ history });
  return { setSaveStatus, setHistory };
}

const MAX_EDIT_HISTORY = 40;
let gestureHistoryArmed = false;
let gestureAutosaveFlush: (() => void) | null = null;
let initGeneration = 0;
let textEditEndTimer: ReturnType<typeof setTimeout> | null = null;

function cloneTimeline(timeline: EditorStore["timeline"]): EditorStore["timeline"] {
  return structuredClone(timeline);
}

function recordEditHistory(get: () => EditorStore, set: (partial: Partial<EditorStore>) => void) {
  const snap = cloneTimeline(get().timeline);
  const past = get().editPast ?? [];
  set({
    editPast: [...past.slice(-(MAX_EDIT_HISTORY - 1)), snap],
    editFuture: [],
  });
}

function triggerAutosave(get: () => EditorStore, set: (partial: Partial<EditorStore>) => void) {
  const { setSaveStatus, setHistory } = persistHooks(get, set);
  scheduleAutosave(get, setSaveStatus, setHistory);
}

export function endGestureHistory() {
  const wasArmed = gestureHistoryArmed;
  gestureHistoryArmed = false;
  if (textEditEndTimer) {
    clearTimeout(textEditEndTimer);
    textEditEndTimer = null;
  }
  if (wasArmed) gestureAutosaveFlush?.();
}

/** One undo step for a burst of text/property keystrokes; flushes after idle. */
function armTextEditHistory(get: () => EditorStore, set: (partial: Partial<EditorStore>) => void) {
  if (!gestureHistoryArmed) {
    gestureHistoryArmed = true;
    recordEditHistory(get, set);
  }
  if (textEditEndTimer) clearTimeout(textEditEndTimer);
  textEditEndTimer = setTimeout(() => endGestureHistory(), 450);
}

function clearLocalEditHistory(set: (partial: Partial<EditorStore>) => void) {
  gestureHistoryArmed = false;
  if (textEditEndTimer) {
    clearTimeout(textEditEndTimer);
    textEditEndTimer = null;
  }
  set({ editPast: [], editFuture: [] });
}

function timelineWithDuration(
  timeline: EditorStore["timeline"],
  endMs: number,
): EditorStore["timeline"] {
  return {
    ...timeline,
    durationMs: Math.max(timeline.durationMs, endMs),
  };
}

function resetUi(ui: EditorUIState): EditorUIState {
  return {
    ...ui,
    activeTool: "media",
    selectedItemId: null,
    selectedTransitionId: null,
    playheadMs: 0,
    previewScrubMs: null,
    isPlaying: false,
    playbackSpeed: ui.playbackSpeed ?? 1,
    toolPanelOpen: false,
    rightPanelOpen: false,
    agentPanelOpen: true,
    agentMentionIds: [],
    agentBusy: false,
    replaceMediaOpen: false,
    infoOpen: false,
    supportOpen: false,
    mediaSearchQuery: "",
    mediaSourceTab: "stock",
    restoreDialogId: null,
    resetConfirmOpen: false,
    saveStatus: "saved",
    lastRenderedDurationMs: ui.lastRenderedDurationMs ?? null,
  };
}

export const useEditorStore = create<EditorStore>((set, get) => {
  gestureAutosaveFlush = () => triggerAutosave(get, set);
  return {
  ...EMPTY_STATE,
  ui: {
    loadStatus: "idle",
    loadError: null,
    loadErrorCode: null,
    canRetryGeneration: false,
    projectStatus: null,
    activeTool: "media",
    selectedItemId: null,
    selectedTransitionId: null,
    playheadMs: 0,
    previewScrubMs: null,
    isPlaying: false,
    playbackSpeed: 1,
    saveStatus: "saved",
    toolPanelOpen: false,
    rightPanelOpen: false,
    agentPanelOpen: true,
    agentMentionIds: [],
    agentBusy: false,
    replaceMediaOpen: false,
    infoOpen: false,
    supportOpen: false,
    mediaSearchQuery: "",
    mediaSourceTab: "stock",
    restoreDialogId: null,
    resetConfirmOpen: false,
    lastRenderedDurationMs: null,
  },

  init: async (projectId) => {
    const gen = ++initGeneration;
    resetAutosaveIdentity();
    set({
      ui: {
        ...get().ui,
        loadStatus: "loading",
        loadError: null,
        loadErrorCode: null,
        canRetryGeneration: false,
        projectStatus: null,
      },
    });
    try {
      const data = await loadEditorState(projectId);
      if (gen !== initGeneration) return;
      clearLocalEditHistory(set);
      set({
        ...data,
        editPast: [],
        editFuture: [],
        ui: {
          ...resetUi(get().ui),
          loadStatus: "ready",
          loadError: null,
          loadErrorCode: null,
          canRetryGeneration: false,
          projectStatus: null,
          saveStatus: "saved",
        },
      });
      markEditorFlushed(get());
    } catch (err) {
      if (gen !== initGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to load editor";
      set({
        ui: {
          ...get().ui,
          loadStatus: "error",
          loadError: message,
          loadErrorCode: isEditorLoadError(err) ? err.code : "load_failed",
          canRetryGeneration: isEditorLoadError(err) ? err.canRetryGeneration : false,
          projectStatus: isEditorLoadError(err) ? err.projectStatus : null,
        },
      });
    }
  },

  setActiveTool: (tool) => set({ ui: { ...get().ui, activeTool: tool } }),
  selectItem: (itemId) => {
    set({
      ui: {
        ...get().ui,
        selectedItemId: itemId,
        selectedTransitionId: null,
        // Do not auto-open inspector — drag/select must stay real-time (ADR editor UX).
      },
    });
  },
  selectTransition: (transitionId) =>
    set({
      ui: {
        ...get().ui,
        selectedTransitionId: transitionId,
        selectedItemId: null,
        activeTool: transitionId ? "transitions" : get().ui.activeTool,
        toolPanelOpen: transitionId ? true : get().ui.toolPanelOpen,
        // Left Transitions panel is the editor; avoid duplicate right-sheet inspector.
        rightPanelOpen: transitionId ? false : get().ui.rightPanelOpen,
      },
    }),
  setPlayhead: (ms) =>
    set({ ui: { ...get().ui, playheadMs: clamp(ms, 0, get().timeline.durationMs) } }),
  setPreviewScrubMs: (ms) =>
    set({
      ui: {
        ...get().ui,
        previewScrubMs:
          ms == null ? null : clamp(ms, 0, get().timeline.durationMs),
      },
    }),
  setPlaying: (playing) =>
    set({
      ui: {
        ...get().ui,
        isPlaying: playing,
        // Scrub overlay must not fight the transport clock.
        previewScrubMs: playing ? null : get().ui.previewScrubMs,
      },
    }),
  setPlaybackSpeed: (speed) =>
    set({ ui: { ...get().ui, playbackSpeed: clamp(speed, 0.25, 2) } }),
  setZoom: (zoom) => {
    const timeline = {
      ...get().timeline,
      settings: { ...get().timeline.settings, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) },
    };
    set({ timeline });
  },
  updateSettings: (patch) => {
    const keys = Object.keys(patch);
    const uiOnly = keys.every(
      (k) => k === "zoom" || k === "snappingEnabled" || k === "previewMuted",
    );
    if (!uiOnly) recordEditHistory(get, set);
    const timeline = { ...get().timeline, settings: { ...get().timeline.settings, ...patch } };
    set({ timeline });
    // Zoom-only / UI chrome shouldn't spam autosave snapshots.
    // showTransitions affects export (hard cuts when off) — must autosave.
    // previewMuted is preview-only — skip autosave.
    if (!uiOnly) triggerAutosave(get, set);
  },
  setSaveStatus: (status) => set({ ui: { ...get().ui, saveStatus: status } }),
  setInfoOpen: (open) => set({ ui: { ...get().ui, infoOpen: open } }),
  setSupportOpen: (open) => set({ ui: { ...get().ui, supportOpen: open } }),
  setRightPanelOpen: (open) => set({ ui: { ...get().ui, rightPanelOpen: open } }),
  setAgentPanelOpen: (open) => set({ ui: { ...get().ui, agentPanelOpen: open } }),
  toggleAgentPanel: (open) =>
    set({
      ui: {
        ...get().ui,
        agentPanelOpen: open !== undefined ? open : !get().ui.agentPanelOpen,
      },
    }),
  setAgentBusy: (busy) => set({ ui: { ...get().ui, agentBusy: busy } }),
  addAgentMentions: (ids) => {
    const next = [...get().ui.agentMentionIds];
    for (const id of ids) {
      if (!id || next.includes(id)) continue;
      next.push(id);
    }
    set({
      ui: {
        ...get().ui,
        agentMentionIds: next,
        agentPanelOpen: true,
      },
    });
  },
  removeAgentMention: (id) =>
    set({
      ui: {
        ...get().ui,
        agentMentionIds: get().ui.agentMentionIds.filter((x) => x !== id),
      },
    }),
  clearAgentMentions: () => set({ ui: { ...get().ui, agentMentionIds: [] } }),
  setReplaceMediaOpen: (open) => set({ ui: { ...get().ui, replaceMediaOpen: open } }),
  toggleToolPanel: (open) =>
    set({
      ui: {
        ...get().ui,
        toolPanelOpen: open !== undefined ? open : !get().ui.toolPanelOpen,
      },
    }),
  setMediaSearch: (query) => set({ ui: { ...get().ui, mediaSearchQuery: query } }),
  setMediaSourceTab: (tab) => set({ ui: { ...get().ui, mediaSourceTab: tab } }),

  replaceMedia: (itemId, assetId) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset) return;
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId && (item.type === "video" || item.type === "broll")
          ? {
              ...item,
              assetId,
              label: asset.label,
              thumbnailUrl: asset.thumbnailUrl || asset.url,
              mediaType: asset.mediaType,
            }
          : item,
      ),
    }));
    set({
      timeline: { ...get().timeline, tracks },
      ui: { ...get().ui, replaceMediaOpen: false },
    });
    triggerAutosave(get, set);
  },

  addAssetFromUrl: (url, itemId, meta) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const assetId = `asset-url-${Date.now()}`;
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(trimmed);
    const asset: Asset = {
      id: assetId,
      sourceType: meta?.sourceKey ? "local" : "url",
      mediaType: isVideo ? "video" : "image",
      label: meta?.label || "URL asset",
      url: trimmed,
      thumbnailUrl: isVideo ? "" : trimmed,
      metadata: meta?.sourceKey ? { sourceKey: meta.sourceKey } : undefined,
    };
    set({ assets: [...get().assets, asset] });
    get().replaceMedia(itemId, assetId);
  },

  moveItem: (itemId, startMs) => {
    if (findTrackForItem(get(), itemId)?.locked) return;
    get().beginGestureHistory();
    const prev = findItem(get(), itemId);
    const duration = prev ? prev.endMs - prev.startMs : 0;
    const maxStart = get().timeline.durationMs - duration;
    const clampedStart = clamp(startMs, 0, maxStart);
    const deltaMs = prev ? clampedStart - prev.startMs : 0;
    const deltaSec = deltaMs / 1000;
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.id !== itemId) return item;
        const next = {
          ...item,
          startMs: clampedStart,
          endMs: clampedStart + duration,
        };
        // Keep karaoke word clocks locked to the clip window after moves.
        if (
          item.type === "captions" &&
          "words" in item &&
          item.words?.length &&
          Math.abs(deltaSec) > 1e-6
        ) {
          return {
            ...next,
            words: item.words.map((w) => ({
              ...w,
              startSec: w.startSec + deltaSec,
            })),
          };
        }
        return next;
      }),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    // Autosave deferred to endGestureHistory while dragging.
  },

  trimItem: (itemId, startMs, endMs) => {
    if (findTrackForItem(get(), itemId)?.locked) return;
    get().beginGestureHistory();
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.id !== itemId) return item;
        const deltaStart = startMs - item.startMs;
        const next = { ...item, startMs, endMs };
        if (
          item.type === "video" ||
          item.type === "broll" ||
          item.type === "narration" ||
          item.type === "music" ||
          item.type === "sfx"
        ) {
          const prevSource = "sourceStartMs" in item ? (item.sourceStartMs ?? 0) : 0;
          return { ...next, sourceStartMs: Math.max(0, prevSource + deltaStart) };
        }
        if (item.type === "captions" && item.words?.length && Math.abs(deltaStart) > 0) {
          const dSec = deltaStart / 1000;
          const winStart = startMs / 1000;
          const winEnd = endMs / 1000;
          return {
            ...next,
            words: item.words
              .map((w) => ({ ...w, startSec: w.startSec + dSec }))
              .filter((w) => w.startSec + w.durationSec > winStart && w.startSec < winEnd),
          };
        }
        return next;
      }),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    // Autosave deferred to endGestureHistory while trimming.
  },

  updateTextItem: (itemId, patch) => {
    armTextEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId && (item.type === "text" || item.type === "captions")
          ? { ...item, ...patch }
          : item,
      ),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateAnimationItem: (itemId, patch) => {
    armTextEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId && item.type === "animation" ? { ...item, ...patch } : item,
      ),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateTextPosition: (itemId, x, y) => {
    armTextEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.id !== itemId) return item;
        if (item.type === "text" || item.type === "captions" || item.type === "animation") {
          const transform = resolveTransform(item.transform, { x, y });
          return {
            ...item,
            position: { x, y },
            transform: { ...transform, x, y },
          };
        }
        return item;
      }),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateItemTransform: (itemId, transform) => {
    get().beginGestureHistory();
    const next = resolveTransform(transform);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.id !== itemId) return item;
        if (item.type === "video" || item.type === "broll") {
          return { ...item, transform: { ...next } };
        }
        if (item.type === "text" || item.type === "captions" || item.type === "animation") {
          // Always assign a fresh transform object — captions used to share refs
          // from realignCaptionsToSpeechLayout, so one drag moved every cue.
          return {
            ...item,
            transform: { ...next },
            position: { x: next.x, y: next.y },
          };
        }
        return item;
      }),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    // Autosave deferred to endGestureHistory while transforming.
  },

  repairArollFullFrameSilent: () => {
    let repaired = 0;
    const tracks = get().timeline.tracks.map((track) => {
      if (track.type !== "video") return track;
      return {
        ...track,
        items: track.items.map((item) => {
          if (item.type !== "video") return item;
          const t = resolveTransform(item.transform);
          const nearFull =
            Math.abs(t.x - 50) < 0.5 &&
            Math.abs(t.y - 50) < 0.5 &&
            t.scaleX >= 0.98 &&
            t.scaleY >= 0.98 &&
            Math.abs(t.rotation) < 0.5;
          if (nearFull) return item;
          repaired += 1;
          return {
            ...item,
            transform: { ...t, x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
          };
        }),
      };
    });
    if (repaired > 0) {
      set({ timeline: { ...get().timeline, tracks } });
    }
    return repaired;
  },

  updateItemAnimation: (itemId, animation) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.id !== itemId) return item;
        if (
          item.type === "video" ||
          item.type === "broll" ||
          item.type === "text" ||
          item.type === "captions" ||
          item.type === "animation"
        ) {
          return { ...item, animation };
        }
        return item;
      }),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  toggleCaptions: (enabled) => get().updateSettings({ captionsEnabled: enabled }),

  setTransition: (transitionId, type, durationMs) => {
    recordEditHistory(get, set);
    const transitions = get().timeline.transitions.map((t) =>
      t.id === transitionId
        ? { ...t, transitionType: type, durationMs: durationMs ?? t.durationMs }
        : t,
    );
    set({ timeline: { ...get().timeline, transitions } });
    triggerAutosave(get, set);
  },

  deleteTransition: (transitionId) => {
    recordEditHistory(get, set);
    const transitions = get().timeline.transitions.map((t) =>
      t.id === transitionId
        ? { ...t, enabled: false, transitionType: "cut" as const, durationMs: 0 }
        : t,
    );
    set({
      timeline: { ...get().timeline, transitions },
      ui: {
        ...get().ui,
        selectedTransitionId:
          get().ui.selectedTransitionId === transitionId ? null : get().ui.selectedTransitionId,
      },
    });
    triggerAutosave(get, set);
  },

  addTransition: (afterItemId, type, durationMs = 500) => {
    const videoTrack = get().timeline.tracks.find((t) => t.type === "video");
    if (!videoTrack?.items.some((i) => i.id === afterItemId)) return null;
    const sorted = [...videoTrack.items].sort((a, b) => a.startMs - b.startMs);
    const idx = sorted.findIndex((i) => i.id === afterItemId);
    const next = idx >= 0 ? sorted[idx + 1] : undefined;
    if (!next) return null;
    // Only allow transitions on abutting cuts (no gap / overlap seams).
    if (!clipsAbut(sorted[idx]!.endMs, next.startMs)) return null;
    const existing = get().timeline.transitions.find((t) => t.afterItemId === afterItemId && t.enabled);
    if (existing) {
      get().setTransition(existing.id, type, durationMs);
      return existing.id;
    }
    recordEditHistory(get, set);
    const id = `tr-${Date.now()}`;
    const transitions = [
      ...get().timeline.transitions,
      {
        id,
        afterItemId,
        transitionType: type,
        durationMs,
        enabled: true,
      },
    ];
    set({
      timeline: { ...get().timeline, transitions },
      ui: { ...get().ui, selectedTransitionId: id, selectedItemId: null },
    });
    triggerAutosave(get, set);
    return id;
  },

  deleteItem: (itemId) => {
    const item = findItem(get(), itemId);
    if (!item) return false;
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.filter((i) => i.id !== itemId),
    }));
    const transitions = get().timeline.transitions.filter((t) => t.afterItemId !== itemId);
    set({
      timeline: { ...get().timeline, tracks, transitions },
      ui: {
        ...get().ui,
        selectedItemId: get().ui.selectedItemId === itemId ? null : get().ui.selectedItemId,
      },
    });
    triggerAutosave(get, set);
    return true;
  },

  duplicateItem: (itemId) => {
    const state = get();
    let source: (typeof state.timeline.tracks)[number]["items"][number] | null = null;
    let trackId: string | null = null;
    for (const track of state.timeline.tracks) {
      const found = track.items.find((i) => i.id === itemId);
      if (found) {
        source = found;
        trackId = track.id;
        break;
      }
    }
    if (!source || !trackId) return null;
    if (state.timeline.tracks.find((t) => t.id === trackId)?.locked) return null;
    recordEditHistory(get, set);
    const dur = Math.max(250, source.endMs - source.startMs);
    const newId = generateShortId(`${source.type}-`);
    const track = state.timeline.tracks.find((t) => t.id === trackId)!;
    // Place after the last same-track item to avoid stacking on the next clip.
    const lastEnd = Math.max(source.endMs, ...track.items.map((i) => i.endMs));
    const clone = {
      ...structuredClone(source),
      id: newId,
      startMs: lastEnd,
      endMs: lastEnd + dur,
      label: `${source.label || source.type} copy`,
    };
    const tracks = state.timeline.tracks.map((t) =>
      t.id === trackId ? { ...t, items: [...t.items, clone] } : t,
    );
    set({
      timeline: timelineWithDuration({ ...state.timeline, tracks }, clone.endMs),
      ui: { ...state.ui, selectedItemId: newId },
    });
    triggerAutosave(get, set);
    return newId;
  },

  splitItem: (itemId, atMs) => {
    const state = get();
    let source: TimelineItem | null = null;
    let trackId: string | null = null;
    for (const track of state.timeline.tracks) {
      const found = track.items.find((i) => i.id === itemId);
      if (found) {
        source = found;
        trackId = track.id;
        break;
      }
    }
    if (!source || !trackId) return null;
    if (state.timeline.tracks.find((t) => t.id === trackId)?.locked) return null;
    const MIN_SPLIT_MS = 250;
    if (atMs < source.startMs + MIN_SPLIT_MS || atMs > source.endMs - MIN_SPLIT_MS) {
      return null;
    }
    recordEditHistory(get, set);
    const leftEnd = atMs;
    const rightStart = atMs;
    const rightId = generateShortId(`${source.type}-`);
    const left = { ...source, endMs: leftEnd };
    const right = {
      ...structuredClone(source),
      id: rightId,
      startMs: rightStart,
      endMs: source.endMs,
      label: `${source.label || source.type}`,
    };
    if (
      (right.type === "video" ||
        right.type === "broll" ||
        right.type === "narration" ||
        right.type === "music" ||
        right.type === "sfx") &&
      "sourceStartMs" in right
    ) {
      const prevSource = right.sourceStartMs ?? 0;
      right.sourceStartMs = Math.max(0, prevSource + (rightStart - source.startMs));
    }
    if (right.type === "captions" && right.words?.length) {
      const winStart = rightStart / 1000;
      const winEnd = right.endMs / 1000;
      right.words = right.words.filter(
        (w) => w.startSec + w.durationSec > winStart && w.startSec < winEnd,
      );
    }
    if (left.type === "captions" && left.words?.length) {
      const winStart = left.startMs / 1000;
      const winEnd = leftEnd / 1000;
      left.words = left.words.filter(
        (w) => w.startSec + w.durationSec > winStart && w.startSec < winEnd,
      );
    }
    const tracks = state.timeline.tracks.map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        items: track.items.flatMap((item) =>
          item.id === itemId ? [left, right] : [item],
        ),
      };
    });
    // Transition after the original clip should follow the RIGHT half (into the
    // original next neighbor), not sit between the two halves.
    const transitions = state.timeline.transitions.map((t) =>
      t.afterItemId === itemId ? { ...t, afterItemId: rightId } : t,
    );
    set({
      timeline: { ...state.timeline, tracks, transitions },
      ui: { ...state.ui, selectedItemId: rightId },
    });
    triggerAutosave(get, set);
    return rightId;
  },

  bringItemToFront: (itemId) => {
    const state = get();
    let maxZ = 0;
    for (const track of state.timeline.tracks) {
      for (const item of track.items) {
        if ("transform" in item && item.transform) {
          maxZ = Math.max(maxZ, item.transform.zIndex ?? 0);
        }
      }
    }
    const item = findItem(state, itemId);
    if (!item || !("transform" in item)) return;
    const t = resolveTransform(
      item.transform,
      "position" in item ? item.position : undefined,
    );
    get().updateItemTransform(itemId, { ...t, zIndex: maxZ + 1 });
  },

  sendItemToBack: (itemId) => {
    const state = get();
    let minZ = 0;
    for (const track of state.timeline.tracks) {
      for (const it of track.items) {
        if ("transform" in it && it.transform) {
          minZ = Math.min(minZ, it.transform.zIndex ?? 0);
        }
      }
    }
    const item = findItem(state, itemId);
    if (!item || !("transform" in item)) return;
    const t = resolveTransform(
      item.transform,
      "position" in item ? item.position : undefined,
    );
    get().updateItemTransform(itemId, { ...t, zIndex: minZ - 1 });
  },

  toggleTrackHidden: (trackId) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) =>
      track.id === trackId ? { ...track, hidden: !track.hidden } : track,
    );
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  toggleTrackLocked: (trackId) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) =>
      track.id === trackId ? { ...track, locked: !track.locked } : track,
    );
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  moveTrack: (trackId, direction) => {
    const state = get();
    const visible = resolveVisibleTracks(
      state.timeline.tracks,
      true,
      state.timeline.settings.trackOrder,
    );
    const idx = visible.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= visible.length) return;
    const ids = visible.map((t) => t.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(target, 0, moved!);
    get().reorderTracksByIds(ids);
  },

  reorderTracksByIds: (orderedTrackIds) => {
    const state = get();
    const byId = new Map(state.timeline.tracks.map((t) => [t.id, t]));
    const orderTypes: TrackType[] = [];
    for (const id of orderedTrackIds) {
      const t = byId.get(id);
      if (t && !orderTypes.includes(t.type)) orderTypes.push(t.type);
    }
    for (const type of TRACK_DISPLAY_ORDER) {
      if (!orderTypes.includes(type)) orderTypes.push(type);
    }
    if (
      state.timeline.settings.trackOrder?.length === orderTypes.length &&
      state.timeline.settings.trackOrder.every((t, i) => t === orderTypes[i])
    ) {
      return;
    }
    recordEditHistory(get, set);
    set({
      timeline: {
        ...state.timeline,
        settings: { ...state.timeline.settings, trackOrder: orderTypes },
      },
    });
    triggerAutosave(get, set);
  },

  clearTrackItems: (trackId) => {
    const track = get().timeline.tracks.find((t) => t.id === trackId);
    if (!track || track.items.length === 0) return;
    recordEditHistory(get, set);
    const removedIds = new Set(track.items.map((i) => i.id));
    const tracks = get().timeline.tracks.map((t) =>
      t.id === trackId ? { ...t, items: [] } : t,
    );
    const transitions = get().timeline.transitions.filter((t) => !removedIds.has(t.afterItemId));
    const selectedItemId = get().ui.selectedItemId;
    set({
      timeline: { ...get().timeline, tracks, transitions },
      ui: {
        ...get().ui,
        selectedItemId: selectedItemId && removedIds.has(selectedItemId) ? null : selectedItemId,
      },
    });
    triggerAutosave(get, set);
  },

  addCaption: (text, startMs, durationMs = 4000) => {
    recordEditHistory(get, set);
    const start = startMs ?? get().ui.playheadMs;
    const newItem = {
      id: `cap-${Date.now()}`,
      type: "captions" as const,
      startMs: start,
      endMs: start + Math.max(500, durationMs),
      label: text.length > 24 ? `${text.slice(0, 24)}…` : text,
      text,
      stylePreset: "default",
      fontSize: 22,
      color: "#ffffff",
      fontWeight: "500",
      alignment: "center" as const,
      position: { x: 50, y: 88 },
      hidden: false,
    };
    const tracks = get().timeline.tracks.map((track) =>
      track.type === "captions" ? { ...track, items: [...track.items, newItem] } : track,
    );
    set({
      timeline: timelineWithDuration({ ...get().timeline, tracks }, newItem.endMs),
      ui: { ...get().ui, selectedItemId: newItem.id, activeTool: "text" },
    });
    triggerAutosave(get, set);
    return newItem.id;
  },

  addMusic: (opts = {}) => {
    recordEditHistory(get, set);
    const start = opts.startMs ?? get().ui.playheadMs;
    const duration = opts.durationMs ?? 15000;
    const assetId = `asset-music-${Date.now()}`;
    const asset: Asset = {
      id: assetId,
      sourceType: opts.url ? "url" : "local",
      mediaType: "audio",
      label: opts.label || "Music bed",
      url: opts.url || "",
      thumbnailUrl: "",
      durationMs: duration,
    };
    const newItem = {
      id: `music-${Date.now()}`,
      type: "music" as const,
      startMs: start,
      endMs: start + duration,
      label: opts.label || "Music bed",
      assetId,
      volume: opts.volume ?? 35,
      fadeIn: 500,
      fadeOut: 1000,
      hidden: false,
    };
    const tracks = get().timeline.tracks.map((track) =>
      track.type === "music" ? { ...track, items: [...track.items, newItem] } : track,
    );
    set({
      assets: [...get().assets, asset],
      timeline: timelineWithDuration({ ...get().timeline, tracks }, newItem.endMs),
      ui: { ...get().ui, selectedItemId: newItem.id, activeTool: "audio" },
    });
    triggerAutosave(get, set);
    return newItem.id;
  },

  addSfx: (opts = {}) => {
    recordEditHistory(get, set);
    const start = opts.startMs ?? get().ui.playheadMs;
    const duration = opts.durationMs ?? 800;
    const assetId = `asset-sfx-${Date.now()}`;
    const asset: Asset = {
      id: assetId,
      sourceType: opts.url ? "url" : "local",
      mediaType: "audio",
      label: opts.label || "SFX",
      url: opts.url || "",
      thumbnailUrl: "",
      durationMs: duration,
    };
    const newItem = {
      id: `sfx-${Date.now()}`,
      type: "sfx" as const,
      startMs: start,
      endMs: start + duration,
      label: opts.label || "SFX",
      assetId,
      volume: opts.volume ?? 60,
      fadeIn: 0,
      fadeOut: 200,
      hidden: false,
    };
    const tracks = get().timeline.tracks.map((track) =>
      track.type === "sfx" ? { ...track, items: [...track.items, newItem] } : track,
    );
    set({
      assets: [...get().assets, asset],
      timeline: timelineWithDuration({ ...get().timeline, tracks }, newItem.endMs),
      ui: { ...get().ui, selectedItemId: newItem.id, activeTool: "audio" },
    });
    triggerAutosave(get, set);
    return newItem.id;
  },

  addBroll: (opts = {}) => {
    recordEditHistory(get, set);
    const start = opts.startMs ?? get().ui.playheadMs;
    const duration = opts.durationMs ?? 4000;
    const url =
      opts.url ||
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&h=1080&q=80";
    const assetId = `asset-broll-${Date.now()}`;
    const asset: Asset = {
      id: assetId,
      sourceType: opts.sourceType || (opts.sourceKey ? "local" : "url"),
      mediaType: "image",
      label: opts.label || "B-roll",
      url,
      thumbnailUrl: url,
      durationMs: duration,
      metadata: opts.sourceKey ? { sourceKey: opts.sourceKey } : undefined,
    };
    const newItem = {
      id: `broll-${Date.now()}`,
      type: "broll" as const,
      startMs: start,
      endMs: start + duration,
      label: opts.label || "B-roll",
      mediaType: "image" as const,
      assetId,
      fitMode: "cover" as const,
      muted: true,
      thumbnailUrl: url,
      hidden: false,
    };
    const tracks = get().timeline.tracks.map((track) =>
      track.type === "broll" ? { ...track, items: [...track.items, newItem] } : track,
    );
    set({
      assets: [...get().assets, asset],
      timeline: timelineWithDuration({ ...get().timeline, tracks }, newItem.endMs),
      ui: { ...get().ui, selectedItemId: newItem.id, activeTool: "media" },
    });
    triggerAutosave(get, set);
    return newItem.id;
  },

  toggleItemHidden: (itemId) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => (item.id === itemId ? { ...item, hidden: !item.hidden } : item)),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateClipFitMode: (itemId, fitMode) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId && (item.type === "video" || item.type === "broll")
          ? { ...item, fitMode }
          : item,
      ),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateClipMuted: (itemId, muted) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId && (item.type === "video" || item.type === "broll")
          ? { ...item, muted }
          : item,
      ),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateAudioVolume: (itemId, volume) => {
    recordEditHistory(get, set);
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId &&
        (item.type === "narration" || item.type === "music" || item.type === "sfx")
          ? { ...item, volume }
          : item,
      ),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  updateAudioFades: (itemId, fadeInMs, fadeOutMs) => {
    recordEditHistory(get, set);
    const fadeIn = Math.max(0, Math.round(fadeInMs));
    const fadeOut = Math.max(0, Math.round(fadeOutMs));
    const tracks = get().timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId &&
        (item.type === "narration" || item.type === "music" || item.type === "sfx")
          ? { ...item, fadeIn, fadeOut }
          : item,
      ),
    }));
    set({ timeline: { ...get().timeline, tracks } });
    triggerAutosave(get, set);
  },

  addTextOverlay: () => {
    recordEditHistory(get, set);
    const playhead = get().ui.playheadMs;
    const newItem = {
      id: `txt-${Date.now()}`,
      type: "text" as const,
      startMs: playhead,
      endMs: playhead + 5000,
      label: "Title",
      text: "Your text here",
      stylePreset: "default",
      fontSize: 32,
      color: "#ffffff",
      fontWeight: "700",
      alignment: "center" as const,
      fontFamily: "montserrat",
      boxWidthPct: 70,
      position: { x: 50, y: 42 },
      transform: {
        x: 50,
        y: 42,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        zIndex: 12,
      },
      animation: {
        in: { preset: "fade" as const, durationMs: 350 },
        out: { preset: "fade" as const, durationMs: 300 },
      },
      hidden: false,
    };
    const tracks = get().timeline.tracks.map((track) =>
      track.type === "text" ? { ...track, items: [...track.items, newItem] } : track,
    );
    set({
      timeline: timelineWithDuration(
        { ...get().timeline, tracks },
        newItem.endMs,
      ),
      ui: {
        ...get().ui,
        selectedItemId: newItem.id,
        selectedTransitionId: null,
        activeTool: "text",
        rightPanelOpen: true,
      },
    });
    triggerAutosave(get, set);
    return newItem.id;
  },

  addAnimation: (preset, startMs) => {
    recordEditHistory(get, set);
    const isCta = preset === "subscribe-cta";
    const isChapter = preset === "chapter-title" || preset === "lower-third";
    const pos = isCta
      ? { x: 85, y: 12 }
      : preset === "lower-third"
        ? { x: 22, y: 82 }
        : isChapter
          ? { x: 50, y: 40 }
          : { x: 50, y: 50 };
    const newItem = {
      id: `anim-${Date.now()}`,
      type: "animation" as const,
      startMs,
      endMs: startMs + (isCta ? 5000 : 4000),
        label: isCta ? "Subscribe CTA" : preset === "lower-third" ? "Lower third" : isChapter ? "Chapter" : preset,
      preset,
      intensity: isCta ? 80 : 70,
      boxWidthPct: isChapter ? 70 : undefined,
      position: pos,
      transform: {
        x: pos.x,
        y: pos.y,
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

  setRestoreDialogId: (id) => set({ ui: { ...get().ui, restoreDialogId: id } }),
  setResetConfirmOpen: (open) => set({ ui: { ...get().ui, resetConfirmOpen: open } }),
  setLastRenderedDurationMs: (ms) =>
    set({ ui: { ...get().ui, lastRenderedDurationMs: ms } }),

  restoreSnapshot: async (snapshotId) => {
    const projectId = get().project.id;
    set({ ui: { ...get().ui, restoreDialogId: null, saveStatus: "saving" } });
    try {
      const { state, history } = await restoreSnapshotRemote(projectId, snapshotId);
      clearLocalEditHistory(set);
      set({
        project: state.project,
        timeline: state.timeline,
        assets: state.assets,
        history,
        editPast: [],
        editFuture: [],
        ui: {
          ...get().ui,
          selectedItemId: null,
          selectedTransitionId: null,
          playheadMs: 0,
          previewScrubMs: null,
          isPlaying: false,
          saveStatus: "saved",
        },
      });
    } catch (err) {
      console.error(err);
      set({ ui: { ...get().ui, saveStatus: "error" } });
    }
  },

  resetTimeline: async () => {
    const projectId = get().project.id;
    set({ ui: { ...get().ui, resetConfirmOpen: false, saveStatus: "saving" } });
    try {
      const { state, history } = await resetTimelineRemote(projectId);
      clearLocalEditHistory(set);
      set({
        project: state.project,
        timeline: state.timeline,
        assets: state.assets,
        history,
        editPast: [],
        editFuture: [],
        ui: {
          ...get().ui,
          selectedItemId: null,
          selectedTransitionId: null,
          playheadMs: 0,
          previewScrubMs: null,
          isPlaying: false,
          saveStatus: "saved",
          rightPanelOpen: false,
        },
      });
    } catch (err) {
      console.error(err);
      set({ ui: { ...get().ui, saveStatus: "error" } });
    }
  },

  flushSave: async () => {
    const { setSaveStatus, setHistory } = persistHooks(get, set);
    await flushAutosave(get, setSaveStatus, setHistory);
  },

  getSelectedItem: () => {
    const id = get().ui.selectedItemId;
    return id ? findItem(get(), id) : null;
  },

  getAsset: (assetId) => get().assets.find((a) => a.id === assetId),

  beginGestureHistory: () => {
    // Close an in-progress text burst so the next drag/trim gets its own undo step.
    if (textEditEndTimer) {
      clearTimeout(textEditEndTimer);
      textEditEndTimer = null;
      gestureHistoryArmed = false;
    }
    if (gestureHistoryArmed) return;
    gestureHistoryArmed = true;
    recordEditHistory(get, set);
  },

  undo: () => {
    const past = get().editPast ?? [];
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const current = cloneTimeline(get().timeline);
    set({
      timeline: previous,
      editPast: past.slice(0, -1),
      editFuture: [current, ...(get().editFuture ?? [])].slice(0, MAX_EDIT_HISTORY),
      ui: { ...get().ui, isPlaying: false },
    });
    gestureHistoryArmed = false;
    triggerAutosave(get, set);
  },

  redo: () => {
    const future = get().editFuture ?? [];
    if (future.length === 0) return;
    const next = future[0];
    const current = cloneTimeline(get().timeline);
    set({
      timeline: next,
      editPast: [...(get().editPast ?? []), current].slice(-MAX_EDIT_HISTORY),
      editFuture: future.slice(1),
      ui: { ...get().ui, isPlaying: false },
    });
    gestureHistoryArmed = false;
    triggerAutosave(get, set);
  },

  markUnsaved: () => set({ ui: { ...get().ui, saveStatus: "unsaved" } }),
  };
});
