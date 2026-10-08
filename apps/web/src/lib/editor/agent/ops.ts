/** Validated timeline tools. Existing narration uses ordinary editing tools; speech generation is separate. */

import type {
  ElementAnimation,
  ElementTransform,
  FitMode,
  TimelineSettings,
  TransitionType,
} from "../types";
import { endGestureHistory, useEditorStore } from "../store";
import type { GraphicObject } from "@hanuman/shared-types";
import { parseAgentPayload } from "./op-validation";
import { isEditorialARollId } from "@hanuman/shared-types";
import { findOverlappingClipIds } from "../clip-collision";

export const AGENT_OP_NAMES = [
  "add_graphic", "update_graphic", "set_keyframes", "add_media", "update_track", "update_clip", "undo", "redo",
  "delete_item",
  "move_item",
  "trim_item",
  "replace_media",
  "add_caption",
  "add_text",
  "update_text",
  "update_text_position",
  "add_music",
  "add_sfx",
  "add_broll",
  "set_volume",
  "add_transition",
  "set_transition",
  "remove_transition",
  "add_animation",
  "add_motion_template",
  "add_motion_scene",
  "update_motion_scene",
  "update_item_animation",
  "update_transform",
  "update_fit_mode",
  "update_audio_fades",
  "update_caption_style",
  "duplicate_item",
  "split_item",
  "update_settings",
  "toggle_captions",
  "select_item",
  "set_playhead",
  "update_motion_template",
  "set_text_style",
  "set_clip_muted",
  "toggle_item_hidden",
  "bring_to_front",
  "send_to_back",
  "set_theme",
  "toggle_track_hidden",
  "update_clip_effects",
  "set_transition_sound",
] as const;

export type AgentOpName = (typeof AGENT_OP_NAMES)[number];

/** Ops that must never appear in the agent schema (documentation + runtime guard). */
export const BANNED_TTS_OP_NAMES = [
  "regenerate_voice",
  "regenerate_narration",
  "synthesize_speech",
  "change_voice",
  "tts",
] as const;

export type AgentOp =
  | { op: "add_graphic"; type: GraphicObject["type"]; startMs?: number; durationMs?: number; text?: string; src?: string; color?: string; width_pct?: number; height_pct?: number; shape?: GraphicObject["shape"]; data?: GraphicObject["data"]; transform?: GraphicObject["transform"]; keyframes?: GraphicObject["keyframes"] }
  | { op: "update_graphic"; itemId: string; patch: Partial<GraphicObject> }
  | { op: "set_keyframes"; itemId: string; keyframes: NonNullable<GraphicObject["keyframes"]> }
  | { op: "add_media"; assetId: string; startMs?: number; durationMs?: number }
  | { op: "update_track"; trackId: string; hidden?: boolean; locked?: boolean }
  | { op: "update_clip"; itemId: string; fitMode?: FitMode; muted?: boolean; threeScene?: import("@hanuman/shared-types").ThreeScene | null }
  | { op: "undo" | "redo" }
  | { op: "update_clip_effects"; itemId: string; patch: import("@hanuman/shared-types").ClipVisualEffects }
  | { op: "set_transition_sound"; transitionId: string; enabled: boolean }
  | { op: "add_motion_scene"; scene: import("@hanuman/shared-types").MotionScene; startMs?: number }
  | { op: "update_motion_scene"; itemId: string; scene: import("@hanuman/shared-types").MotionScene }
  | { op: "delete_item"; itemId: string }
  | { op: "move_item"; itemId: string; startMs: number }
  | { op: "trim_item"; itemId: string; startMs: number; endMs: number }
  | { op: "replace_media"; itemId: string; url: string; sourceLabel?: string }
  | { op: "add_caption"; text: string; startMs?: number; durationMs?: number }
  | { op: "add_text"; text: string; startMs?: number; durationMs?: number }
  | {
      op: "update_text";
      itemId: string;
      text?: string;
      fontSize?: number;
      color?: string;
      fontWeight?: string;
      alignment?: "left" | "center" | "right";
      fontFamily?: string; boxWidthPct?: number; stylePreset?: string;
    }
  | { op: "update_text_position"; itemId: string; x: number; y: number }
  | {
      op: "add_music";
      label?: string;
      url?: string;
      startMs?: number;
      durationMs?: number;
      volume?: number;
    }
  | {
      op: "add_sfx";
      preset?: "soft_whoosh" | "soft_impact" | "editorial_tick";
      label?: string;
      url?: string;
      startMs?: number;
      durationMs?: number;
      volume?: number;
    }
  | {
      op: "add_broll";
      mediaType?: "image" | "video";
      label?: string;
      url?: string;
      startMs?: number;
      durationMs?: number;
    }
  | { op: "set_volume"; itemId: string; volume: number }
  | {
      op: "add_transition";
      afterItemId: string;
      type: TransitionType;
      durationMs?: number;
    }
  | { op: "set_transition"; transitionId: string; type: TransitionType; durationMs?: number }
  | { op: "remove_transition"; transitionId: string }
  | { op: "add_animation"; preset: string; startMs?: number }
  | {
      op: "add_motion_template";
      itemId?: string;
      libraryTemplateId?: string;
      htmlTemplate?: import("@hanuman/shared-types").HtmlTemplate;
      documentaryLayout?: import("@hanuman/shared-types").DocumentaryLayout;
      elements?: Array<{ label: string; detail?: string }>;
      links?: Array<{ from: number; to: number }>;
      templateId: string;
      startMs?: number;
      durationMs?: number;
      title?: string;
      subtitle?: string;
      slots?: Array<{ text?: string; value?: number; color?: string; label?: string }>;
      imageRefs?: string[];
      themeId?: string;
      sourceLabel?: string;
    }
  | {
      op: "update_item_animation";
      itemId: string;
      animation: ElementAnimation;
    }
  | {
      op: "update_transform";
      itemId: string;
      transform: Partial<ElementTransform>;
    }
  | { op: "update_fit_mode"; itemId: string; fitMode: FitMode }
  | { op: "update_audio_fades"; itemId: string; fadeInMs: number; fadeOutMs: number }
  | {
      op: "update_caption_style";
      style: TimelineSettings["captionStyle"];
    }
  | { op: "duplicate_item"; itemId: string }
  | { op: "split_item"; itemId: string; atMs?: number }
  | {
      op: "update_settings";
      patch: Partial<
        Pick<
          TimelineSettings,
          | "backgroundColor"
          | "backgroundImage"
          | "overlayDropShadow"
          | "narrationVolume"
          | "musicVolume"
          | "sfxVolume"
          | "clipAudioVolume"
          | "captionsEnabled"
          | "showTransitions"
          | "captionStyle"
        >
      >;
    }
  | { op: "toggle_captions"; enabled: boolean }
  | { op: "select_item"; itemId: string }
  | { op: "set_playhead"; ms: number }
  | {
      /** Edit an existing motion-graphic overlay in place (chart values, copy, theme). */
      op: "update_motion_template";
      htmlTemplate?: import("@hanuman/shared-types").HtmlTemplate;
      layerEdits?: Record<string, import("@hanuman/shared-types").TemplateLayerEdit>;
      documentaryLayout?: import("@hanuman/shared-types").DocumentaryLayout;
      elements?: Array<{ label: string; detail?: string }>;
      links?: Array<{ from: number; to: number }>;
      itemId: string;
      title?: string;
      subtitle?: string;
      slots?: Array<{ text?: string; value?: number; color?: string; label?: string }>;
      imageRefs?: string[];
      themeId?: string;
      sourceLabel?: string;
      boxWidthPct?: number;
    }
  | {
      op: "set_text_style";
      itemId: string;
      stylePreset?: string;
      fontFamily?: string;
      boxWidthPct?: number;
    }
  | { op: "set_clip_muted"; itemId: string; muted: boolean }
  | { op: "toggle_item_hidden"; itemId: string }
  | { op: "bring_to_front"; itemId: string }
  | { op: "send_to_back"; itemId: string }
  | { op: "set_theme"; themeId: NonNullable<TimelineSettings["themeId"]> }
  | { op: "toggle_track_hidden"; trackType: string };

export interface AgentOpResult {
  ok: boolean;
  summary: string;
  error?: string;
}

function findItem(itemId: string) {
  const state = useEditorStore.getState();
  for (const track of state.timeline.tracks) {
    const item = track.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

function findItemLabel(itemId: string): string {
  const item = findItem(itemId);
  return item ? item.label || item.id : itemId;
}

/** Runtime guard — rejects banned / unknown ops even if LLM invents them. */
export function assertAllowedOp(raw: unknown): AgentOp | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const op = typeof src.op === "string" ? src.op.trim() : "";
  if (!op) return null;
  const lower = op.toLowerCase();
  if ((BANNED_TTS_OP_NAMES as readonly string[]).includes(lower)) return null;
  if (lower.includes("tts") || lower.includes("synth") || lower.includes("regenerate")) return null;

  const camel: Record<string, unknown> = { ...src };
  const aliases: Record<string, string> = {
    item_id: "itemId", track_id: "trackId", asset_id: "assetId",
    after_item_id: "afterItemId",
    after_clip_id: "afterItemId",
    transition_id: "transitionId",
    start_ms: "startMs",
    end_ms: "endMs",
    duration_ms: "durationMs",
    template_id: "templateId",
    fit_mode: "fitMode",
    fade_in_ms: "fadeInMs",
    fade_out_ms: "fadeOutMs",
    at_ms: "atMs",
    image_refs: "imageRefs",
    theme_id: "themeId",
    box_width_pct: "boxWidthPct",
    style_preset: "stylePreset",
    font_family: "fontFamily",
    track_type: "trackType",
    layer_edits: "layerEdits",
    html_template: "htmlTemplate",
    source_label: "sourceLabel",
    font_size: "fontSize",
    font_weight: "fontWeight",
  };
  for (const [from, to] of Object.entries(aliases)) {
    if (camel[from] != null && camel[to] == null) camel[to] = camel[from];
  }

  // LLM often emits set_transition with itemId instead of transitionId
  if (op === "set_transition" && !camel.transitionId && camel.itemId) {
    camel.op = "add_transition";
    camel.afterItemId = camel.itemId;
  }
  if (camel.op === "add_transition" && !camel.afterItemId && camel.itemId) {
    camel.afterItemId = camel.itemId;
  }

  const aliasesByOp: Record<string, string> = { set_caption_style: "update_caption_style", set_animation: "update_item_animation", set_audio_fades: "update_audio_fades" };
  camel.op = aliasesByOp[String(camel.op)] ?? camel.op;
  const finalOp = String(camel.op || "");
  if (!(AGENT_OP_NAMES as readonly string[]).includes(finalOp)) return null;
  return parseAgentPayload(finalOp as AgentOpName, camel) as AgentOp | null;
}

/** Agent gains are normalized; the editor store and sliders use percentages. */
function gainToPercent(gain: number): number {
  return Math.round(gain * 10000) / 100;
}

function extendTimeline(endMs: number): void {
  const store = useEditorStore.getState();
  if (endMs > store.timeline.durationMs) {
    store.beginGestureHistory();
    useEditorStore.setState({ timeline: { ...store.timeline, durationMs: endMs } });
  }
}

/** Added overlays may extend the movie; trimItem deliberately rejects out-of-range ends. */
function setOverlayWindow(itemId: string, startMs: number, endMs: number): boolean {
  extendTimeline(endMs);
  return useEditorStore.getState().trimItem(itemId, startMs, endMs);
}

export function applyAgentOp(op: AgentOp): AgentOpResult {
  const validated = assertAllowedOp(op);
  if (!validated) return { ok: false, summary: "Invalid edit", error: "The command contains unsupported or invalid values." };
  op = validated;
  const store = useEditorStore.getState();
  if ("transitionId" in op) {
    const transition = store.timeline.transitions.find(t => t.id === op.transitionId);
    if (!transition) return { ok: false, summary: "Transition not found", error: "Select an existing transition." };
    const owner = store.timeline.tracks.find(t => t.items.some(i => i.id === transition.afterItemId));
    if (owner?.locked) return { ok: false, summary: "Track locked", error: "Unlock the scene track before changing its transition." };
  }
  const itemId = "itemId" in op ? op.itemId : "afterItemId" in op ? op.afterItemId : null;
  if (itemId) {
    const track = store.timeline.tracks.find((t) => t.items.some((i) => i.id === itemId));
    if (!track) return { ok: false, summary: "Item not found", error: "Select an existing timeline item and retry." };
    if (track.locked && op.op !== "select_item") return { ok: false, summary: "Track locked", error: "Unlock the track before editing it." };
  }
  if ((op.op === "add_music" || op.op === "add_sfx" || op.op === "add_broll") && !op.url?.trim()) {
    return { ok: false, summary: "Media required", error: "Attach a media file or provide its URL. No empty placeholder was added." };
  }

  // Store setters intentionally ignore incompatible targets. The agent must not
  // report those no-ops as successful edits.
  const types: Partial<Record<AgentOpName, string[]>> = {
    update_clip_effects: ["video", "broll"], update_fit_mode: ["video", "broll"],
    replace_media: ["video", "broll"], set_clip_muted: ["video", "broll"],
    update_text: ["text", "captions"], set_text_style: ["text", "captions"], update_text_position: ["text", "captions", "animation"],
    set_volume: ["music", "sfx", "narration"], update_audio_fades: ["music", "sfx", "narration"],
    update_clip: ["video", "broll"], update_graphic: ["animation"], set_keyframes: ["animation"],
    update_transform: ["video", "broll", "text", "captions", "animation"],
    update_item_animation: ["video", "broll", "text", "captions", "animation"],
    bring_to_front: ["video", "broll", "text", "captions", "animation"], send_to_back: ["video", "broll", "text", "captions", "animation"],
  };
  if (itemId && types[op.op] && !types[op.op]!.includes(findItem(itemId)!.type)) {
    return { ok: false, summary: "Incompatible clip", error: `${op.op.replaceAll("_", " ")} cannot be used on this clip type.` };
  }
  const destination = ((op.op === "add_motion_template" && isEditorialARollId(op.templateId)) || (op.op === "add_animation" && isEditorialARollId(op.preset))) ? "video" : ({ add_text: "text", add_caption: "captions", add_music: "music", add_sfx: "sfx", add_broll: "broll", add_animation: "animation", add_motion_template: "animation", add_motion_scene: "animation", add_graphic: "animation" } as Record<string, string>)[op.op];
  if (destination && !store.timeline.tracks.some(t => t.type === destination)) {
    return { ok: false, summary: "Track missing", error: `The ${destination} track is unavailable. Reload the timeline before adding clips.` };
  }
  if (destination && store.timeline.tracks.find(t => t.type === destination)?.locked) {
    return { ok: false, summary: "Track locked", error: `Unlock the ${destination} track before adding clips.` };
  }

  switch (op.op) {
    case "add_graphic": {
      const { op: _op, startMs, durationMs, ...graphic } = op; void _op;
      store.addGraphic({ ...graphic, start_sec: (startMs ?? store.ui.playheadMs) / 1000, duration_sec: (durationMs ?? 4000) / 1000 });
      return { ok: true, summary: `Added ${graphic.type.replaceAll("_", " ")}` };
    }
    case "update_graphic": case "set_keyframes": {
      const item = findItem(op.itemId);
      if (item?.type !== "animation" || !item.graphic) return { ok: false, summary: "Graphic required", error: "Choose a structured graphic object." };
      const patch = op.op === "set_keyframes" ? { keyframes: op.keyframes } : op.patch;
      if (patch.keyframes?.some(frame => frame.time_sec > (item.endMs - item.startMs) / 1000)) return { ok: false, summary: "Invalid timing", error: "Keyframes exceed the graphic duration." };
      store.updateGraphic(item.id, patch);
      return { ok: true, summary: `Updated graphic “${item.label}”` };
    }
    case "add_media": {
      const asset = store.getAsset(op.assetId);
      if (!asset) return { ok: false, summary: "Missing media", error: "Choose a project asset." };
      const destination = asset.mediaType === "audio" ? "music" : "broll";
      const track = store.timeline.tracks.find(t => t.type === destination);
      if (!track || track.locked) return { ok: false, summary: "Track unavailable", error: `Unlock the ${destination} track before adding media.` };
      const options = { url: asset.url, label: asset.label, startMs: op.startMs, durationMs: op.durationMs ?? asset.durationMs ?? 4000, sourceKey: asset.metadata?.sourceKey };
      if (asset.mediaType === "audio") store.addMusic(options);
      else store.addBroll({ ...options, mediaType: asset.mediaType, sourceType: asset.sourceType, metadata: asset.metadata, thumbnailUrl: asset.thumbnailUrl });
      return { ok: true, summary: `Added “${asset.label}”` };
    }
    case "update_track": {
      const track = store.timeline.tracks.find(t => t.id === op.trackId);
      if (!track) return { ok: false, summary: "Track missing", error: "Choose a current track." };
      if (op.hidden != null && op.hidden !== track.hidden) store.toggleTrackHidden(track.id);
      if (op.locked != null && op.locked !== track.locked) store.toggleTrackLocked(track.id);
      return { ok: true, summary: `Updated “${track.label}” track` };
    }
    case "update_clip": {
      if (op.fitMode) store.updateClipFitMode(op.itemId, op.fitMode);
      if (op.muted != null) store.updateClipMuted(op.itemId, op.muted);
      if (op.threeScene !== undefined) store.updateClipThreeScene(op.itemId, op.threeScene);
      return { ok: true, summary: `Updated “${findItemLabel(op.itemId)}”` };
    }
    case "undo": case "redo": {
      endGestureHistory();
      if (!(op.op === "undo" ? store.editPast : store.editFuture).length) return { ok: false, summary: "History empty", error: `Nothing to ${op.op}.` };
      store[op.op](); return { ok: true, summary: op.op === "undo" ? "Undid the last edit" : "Restored the last edit" };
    }
    case "update_clip_effects": {
      store.updateClipEffects(op.itemId, op.patch);
      return { ok: true, summary: `Adjusted color and effects on “${findItemLabel(op.itemId)}”` };
    }
    case "set_transition_sound": {
      store.setTransitionSound(op.transitionId, op.enabled);
      return { ok: true, summary: op.enabled ? "Enabled transition sound" : "Muted transition sound" };
    }
    case "delete_item": {
      const label = findItemLabel(op.itemId);
      const ok = store.deleteItem(op.itemId);
      return ok
        ? { ok: true, summary: `Deleted “${label}”` }
        : { ok: false, summary: "Delete failed", error: "Item not found" };
    }
    case "move_item": {
      const moving = findItem(op.itemId)!;
      const endMs = op.startMs + moving.endMs - moving.startMs;
      const owner = store.timeline.tracks.find(track => track.items.some(item => item.id === moving.id));
      if (!Number.isFinite(op.startMs) || op.startMs < 0 || !Number.isFinite(endMs) || endMs <= op.startMs ||
          (owner?.type === "video" && findOverlappingClipIds(store.timeline.tracks, moving.id, op.startMs, endMs).length)) {
        return { ok: false, summary: "Move rejected", error: "The requested scene position overlaps another clip or has invalid timing." };
      }
      // A deliberate agent placement can extend the film. Without extending,
      // the drag-oriented store setter silently clamps it to the previous end.
      extendTimeline(endMs);
      if (!store.moveItem(op.itemId, op.startMs)) return { ok: false, summary: "Move rejected", error: "Could not apply the requested scene position." };
      const moved = findItem(op.itemId)!;
      if (moved.startMs !== op.startMs || moved.endMs !== endMs) return { ok: false, summary: "Move rejected", error: "The editor could not preserve the exact requested clip range." };
      return { ok: true, summary: `Moved “${findItemLabel(op.itemId)}” to ${(moved.startMs / 1000).toFixed(1)}s` };
    }
    case "trim_item": {
      if (!store.trimItem(op.itemId, op.startMs, op.endMs)) return { ok: false, summary: "Trim rejected", error: "The requested range is invalid or overlaps another scene." };
      return {
        ok: true,
        summary: `Trimmed “${findItemLabel(op.itemId)}” to ${((op.endMs - op.startMs) / 1000).toFixed(1)}s`,
      };
    }
    case "replace_media": {
      let isPexels = false;
      try { isPexels = new URL(op.url).hostname.toLowerCase().endsWith("pexels.com"); } catch { /* schema rejects malformed URLs */ }
      store.addAssetFromUrl(op.url, op.itemId, isPexels ? {
        sourceType: "stock",
        label: op.sourceLabel || "Pexels stock image",
        metadata: { source: "Pexels", attribution: op.sourceLabel || "Pexels contributor" },
      } : undefined);
      return { ok: true, summary: `Replaced media on “${findItemLabel(op.itemId)}”` };
    }
    case "add_caption": {
      const id = store.addCaption(op.text, op.startMs, op.durationMs);
      return { ok: true, summary: `Added caption “${op.text.slice(0, 40)}” (${id})` };
    }
    case "add_text": {
      const id = store.addTextOverlay();
      const item = findItem(id);
      if (!item) return { ok: false, summary: "Text creation failed", error: "The text track is unavailable." };
      useEditorStore.getState().updateTextItem(id, { text: op.text });
      if (op.startMs != null || op.durationMs != null) {
        const start = op.startMs ?? item.startMs;
        const end = start + (op.durationMs ?? item.endMs - item.startMs);
        if (!setOverlayWindow(id, start, end)) return { ok: false, summary: "Text timing failed", error: "Could not apply the requested text range." };
      }
      return { ok: true, summary: `Added text overlay “${op.text.slice(0, 40)}”` };
    }
    case "update_text": {
      store.updateTextItem(op.itemId, {
        text: op.text,
        fontSize: op.fontSize,
        color: op.color,
        fontWeight: op.fontWeight,
        alignment: op.alignment, fontFamily: op.fontFamily, boxWidthPct: op.boxWidthPct, stylePreset: op.stylePreset,
      });
      return { ok: true, summary: `Updated text on “${findItemLabel(op.itemId)}”` };
    }
    case "update_text_position": {
      store.updateTextPosition(op.itemId, op.x, op.y);
      return { ok: true, summary: `Repositioned “${findItemLabel(op.itemId)}”` };
    }
    case "add_music": {
      const id = store.addMusic({ ...op, volume: op.volume == null ? undefined : gainToPercent(op.volume) });
      return { ok: true, summary: `Added music clip (${id})` };
    }
    case "add_sfx": {
      const id = store.addSfx({ ...op, volume: op.volume == null ? undefined : gainToPercent(op.volume) });
      return { ok: true, summary: `Added SFX (${id})` };
    }
    case "add_broll": {
      const id = store.addBroll(op);
      return { ok: true, summary: `Added B-roll (${id})` };
    }
    case "set_volume": {
      store.updateAudioVolume(op.itemId, gainToPercent(op.volume));
      return { ok: true, summary: `Set volume on “${findItemLabel(op.itemId)}” to ${op.volume}` };
    }
    case "add_transition": {
      const id = store.addTransition(op.afterItemId, op.type, op.durationMs);
      return id
        ? { ok: true, summary: `Added ${op.type} transition after “${findItemLabel(op.afterItemId)}”` }
        : { ok: false, summary: "Transition failed", error: "Transitions need two adjacent, unlocked scene clips." };
    }
    case "set_transition": {
      store.setTransition(op.transitionId, op.type, op.durationMs);
      return { ok: true, summary: `Changed transition to ${op.type}` };
    }
    case "remove_transition": {
      store.deleteTransition(op.transitionId);
      return { ok: true, summary: "Removed transition (hard cut)" };
    }
    case "add_animation": {
      if (isEditorialARollId(op.preset)) return applyAgentOp({ op: "add_motion_template", templateId: op.preset, startMs: op.startMs });
      const start = op.startMs ?? store.ui.playheadMs;
      store.addAnimation(op.preset, start);
      const label =
        op.preset === "subscribe-cta"
          ? "Subscribe CTA"
          : op.preset === "chapter-title" || op.preset === "lower-third"
            ? "Chapter title"
            : op.preset;
      return { ok: true, summary: `Added animation “${label}” (saved to timeline)` };
    }
    case "add_motion_template": {
      const start = op.startMs ?? store.ui.playheadMs;
      if (isEditorialARollId(op.templateId)) {
        const selected = store.ui.selectedItemId ? findItem(store.ui.selectedItemId) : null;
        const targetId = op.itemId ?? (op.startMs == null && (selected?.type === "video" || selected?.type === "broll") ? selected.id : null);
        const clip = targetId ? findItem(targetId) : store.timeline.tracks.find(t => t.type === "video")?.items.find(i => i.type === "video" && i.startMs <= start && i.endMs > start);
        if (!clip || clip.type !== "video") return { ok: false, summary: "No A-roll clip", error: "Full-frame templates require an A-roll video clip. Choose that clip explicitly; the underlying scene was not changed." };
        const values = (op.slots || []).filter(s => s.label && typeof s.value === "number" && Number.isFinite(s.value)).slice(0, 6).map(s => ({ label: s.label!.slice(0, 12), value: s.value! }));
        if (op.templateId === "editorial-data" && (values.length < 2 || !op.sourceLabel)) return { ok: false, summary: "Chart needs evidence", error: "Provide at least two sourced numeric values and sourceLabel; sample figures are not used in real videos." };
        store.updateClipMotionTemplate(clip.id, {
          id: op.templateId, title: (op.title || clip.label).slice(0, 120), subtitle: op.subtitle?.slice(0, 190),
          source_label: op.sourceLabel?.slice(0, 85), ...(values.length ? { values } : {}),
          documentary_layout: op.documentaryLayout, elements: op.elements, links: op.links,
          html_template: op.htmlTemplate,
        });
        return { ok: true, summary: `Applied full-frame “${op.templateId}” to A-roll clip “${clip.label}”` };
      }
      const id = store.addAnimation(op.templateId, start);
      if (op.durationMs != null) {
        const item = useEditorStore.getState().timeline.tracks.flatMap((t) => t.items).find((i) => i.id === id);
        if (!item || !setOverlayWindow(id, item.startMs, item.startMs + op.durationMs)) return { ok: false, summary: "Template timing failed", error: "Could not apply the requested template duration." };
      }
      if (op.title || op.subtitle || op.slots || op.imageRefs || op.themeId) {
        store.updateAnimationItem(id, {
          title: op.title,
          subtitle: op.subtitle,
          slots: op.slots,
          imageRefs: op.imageRefs,
          themeId: op.themeId,
          label: op.title || undefined,
          boxWidthPct: op.templateId === "product-launch-fullscreen" ? 92 : undefined,
        });
      }
      return { ok: true, summary: `Added motion template “${op.templateId}”` };
    }
    case "add_motion_scene": {
      const start = op.startMs ?? store.ui.playheadMs;
      const id = store.addAnimation("generated-scene", start);
      store.updateAnimationItem(id, { scene: op.scene, title: op.scene.title, label: op.scene.title });
      store.updateItemTransform(id, { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 25 });
      if (!setOverlayWindow(id, start, start + op.scene.durationMs)) return { ok: false, summary: "Scene timing failed", error: "Could not apply the requested scene duration." };
      store.selectItem(id);
      store.setPlaying(false);
      store.setPlayhead(start + Math.min(1800, op.scene.durationMs / 2));
      return { ok: true, summary: `Created ${op.scene.layers.length} animated layers with ${op.scene.audio.length} sound cues: ${op.scene.title}` };
    }
    case "update_motion_scene": {
      const item = findItem(op.itemId);
      if (!item || item.type !== "animation" || item.preset !== "generated-scene") return { ok: false, summary: "Update failed", error: "Select a generated motion scene." };
      store.updateAnimationItem(item.id, { scene: op.scene, title: op.scene.title, label: op.scene.title });
      if (!setOverlayWindow(item.id, item.startMs, item.startMs + op.scene.durationMs)) return { ok: false, summary: "Scene timing failed", error: "Could not apply the requested scene duration." };
      return { ok: true, summary: `Updated generated scene: ${op.scene.title}` };
    }
    case "update_item_animation": {
      store.updateItemAnimation(op.itemId, op.animation);
      return { ok: true, summary: `Updated animation on “${findItemLabel(op.itemId)}”` };
    }
    case "update_transform": {
      const item = store.getSelectedItem()?.id === op.itemId
        ? store.getSelectedItem()
        : store.timeline.tracks.flatMap((t) => t.items).find((i) => i.id === op.itemId);
      const base =
        item && "transform" in item && item.transform
          ? item.transform
          : { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 };
      store.updateItemTransform(op.itemId, { ...base, ...op.transform });
      return { ok: true, summary: `Updated transform on “${findItemLabel(op.itemId)}”` };
    }
    case "update_fit_mode": {
      store.updateClipFitMode(op.itemId, op.fitMode);
      return { ok: true, summary: `Set fit mode to ${op.fitMode}` };
    }
    case "update_audio_fades": {
      store.updateAudioFades(op.itemId, op.fadeInMs, op.fadeOutMs);
      return { ok: true, summary: `Updated audio fades on “${findItemLabel(op.itemId)}”` };
    }
    case "update_caption_style": {
      store.updateSettings({ captionStyle: op.style });
      return { ok: true, summary: `Caption style → ${op.style}` };
    }
    case "duplicate_item": {
      const id = store.duplicateItem(op.itemId);
      return id
        ? { ok: true, summary: `Duplicated “${findItemLabel(op.itemId)}”` }
        : { ok: false, summary: "Duplicate failed", error: "Item not found" };
    }
    case "split_item": {
      const at = op.atMs ?? store.ui.playheadMs;
      const id = store.splitItem(op.itemId, at);
      return id
        ? { ok: true, summary: `Split “${findItemLabel(op.itemId)}” at ${(at / 1000).toFixed(1)}s` }
        : { ok: false, summary: "Split failed", error: "Invalid split point" };
    }
    case "update_settings": {
      const safe = op.patch;
      store.updateSettings({ ...safe,
        ...(safe.narrationVolume != null ? { narrationVolume: gainToPercent(safe.narrationVolume) } : {}),
        ...(safe.musicVolume != null ? { musicVolume: gainToPercent(safe.musicVolume) } : {}),
        ...(safe.sfxVolume != null ? { sfxVolume: gainToPercent(safe.sfxVolume) } : {}),
        ...(safe.clipAudioVolume != null ? { clipAudioVolume: gainToPercent(safe.clipAudioVolume) } : {}),
      });
      return { ok: true, summary: `Updated canvas/settings (${Object.keys(safe).join(", ")})` };
    }
    case "toggle_captions": {
      store.toggleCaptions(op.enabled);
      return { ok: true, summary: op.enabled ? "Captions enabled" : "Captions hidden" };
    }
    case "select_item": {
      store.selectItem(op.itemId);
      return { ok: true, summary: `Selected “${findItemLabel(op.itemId)}”` };
    }
    case "set_playhead": {
      store.setPlayhead(op.ms);
      return { ok: true, summary: `Moved playhead to ${(op.ms / 1000).toFixed(1)}s` };
    }
    case "update_motion_template": {
      const item = findItem(op.itemId);
      if (item?.type === "video" && item.motionTemplate) {
        const values = op.slots?.filter(s => s.label && typeof s.value === "number" && Number.isFinite(s.value)).slice(0, 6).map(s => ({ label: s.label!.slice(0, 12), value: s.value! }));
        const next = { ...item.motionTemplate, layer_edits: op.layerEdits ? { ...item.motionTemplate.layer_edits, ...Object.fromEntries(Object.entries(op.layerEdits).map(([id, patch]) => [id, {...item.motionTemplate!.layer_edits?.[id], ...patch}])) } : item.motionTemplate.layer_edits, title: (op.title || item.motionTemplate.title).slice(0, 120), subtitle: op.subtitle?.slice(0, 190) ?? item.motionTemplate.subtitle, source_label: op.sourceLabel?.slice(0, 85) ?? item.motionTemplate.source_label, values: values || item.motionTemplate.values,
          html_template: op.htmlTemplate ?? item.motionTemplate.html_template,
          documentary_layout: op.documentaryLayout ?? item.motionTemplate.documentary_layout,
          elements: op.elements ?? item.motionTemplate.elements, links: op.links ?? item.motionTemplate.links };
        if (next.id === "editorial-data" && (!next.source_label || (next.values?.length ?? 0) < 2)) return { ok: false, summary: "Chart needs evidence", error: "Set a source label and at least two numeric values." };
        store.updateClipMotionTemplate(item.id, next);
        return { ok: true, summary: `Updated full-frame scene “${next.title}”` };
      }
      if (!item || item.type !== "animation") {
        return {
          ok: false,
          summary: "Update failed",
          error: "Item is not a motion graphic / animation overlay",
        };
      }
      if (op.layerEdits || op.htmlTemplate || op.documentaryLayout || op.elements || op.links) {
        return { ok: false, summary: "Unsupported overlay fields", error: "Layer and documentary edits require a full-frame template. For generated scenes use update_motion_scene; for this overlay use title, subtitle, slots or imageRefs." };
      }
      store.updateAnimationItem(op.itemId, {
        title: op.title,
        subtitle: op.subtitle,
        slots: op.slots,
        imageRefs: op.imageRefs,
        themeId: op.themeId,
        boxWidthPct: op.boxWidthPct,
        label: op.title || undefined,
      });
      return { ok: true, summary: `Updated motion graphic “${findItemLabel(op.itemId)}”` };
    }
    case "set_text_style": {
      store.updateTextItem(op.itemId, {
        stylePreset: op.stylePreset,
        fontFamily: op.fontFamily,
        boxWidthPct: op.boxWidthPct,
      });
      return { ok: true, summary: `Restyled “${findItemLabel(op.itemId)}”` };
    }
    case "set_clip_muted": {
      store.updateClipMuted(op.itemId, op.muted);
      return {
        ok: true,
        summary: `${op.muted ? "Muted" : "Unmuted"} “${findItemLabel(op.itemId)}”`,
      };
    }
    case "toggle_item_hidden": {
      const label = findItemLabel(op.itemId);
      store.toggleItemHidden(op.itemId);
      const nowHidden = Boolean(findItem(op.itemId)?.hidden);
      return { ok: true, summary: `${nowHidden ? "Hid" : "Showed"} “${label}”` };
    }
    case "bring_to_front": {
      store.bringItemToFront(op.itemId);
      return { ok: true, summary: `Brought “${findItemLabel(op.itemId)}” to front` };
    }
    case "send_to_back": {
      store.sendItemToBack(op.itemId);
      return { ok: true, summary: `Sent “${findItemLabel(op.itemId)}” to back` };
    }
    case "set_theme": {
      store.updateSettings({ themeId: op.themeId });
      return { ok: true, summary: `Theme → ${op.themeId}` };
    }
    case "toggle_track_hidden": {
      const wanted = String(op.trackType).toLowerCase();
      const track = store.timeline.tracks.find((t) => t.type === wanted);
      if (!track) {
        return { ok: false, summary: "Toggle failed", error: `No “${op.trackType}” track` };
      }
      store.toggleTrackHidden(track.id);
      return {
        ok: true,
        summary: `${track.hidden ? "Showed" : "Hid"} the ${track.label} track`,
      };
    }
  }
}

export function applyAgentOps(ops: AgentOp[]): AgentOpResult[] {
  return ops.map((op) => {
    const allowed = assertAllowedOp(op);
    if (!allowed) {
      return {
        ok: false,
        summary: "Blocked",
        error: "Invalid or unsupported editing operation. Check its required fields and values.",
      };
    }
    return applyAgentOp(allowed);
  });
}

/** JSON Schema fragment for the LLM — intentionally omits all TTS ops. */
export function agentOpsJsonSchemaDescription(): string {
  return [
    "Return JSON: { \"reply\": string, \"ops\": AgentOp[] }",
    "Allowed AgentOp.op values ONLY:",
    AGENT_OP_NAMES.join(", "),
    "Existing narration supports move, trim, split, delete, volume and fades. Speech generation is a separate workflow.",
    "Transition types: zoom | slide-pan | film-burn | glitch | fade | slide | cut",
    "Animation presets include: subscribe-cta, chapter-title, lower-third",
    "Motion templates (add_motion_template.templateId): editorial-title, editorial-data, editorial-archive, editorial-newspaper (full-frame 16:9 A-roll at playhead, never overlays); product-launch-fullscreen, vertical-bar-chart, line-chart, before-after-split, news-highlight, doc-callout, highlight-quote (overlays).",
    "For editorial-data provide 2–6 sourced numeric slots and sourceLabel; never invent numbers. Other editorial styles use the current A-roll clip as media. When replacing with a stock candidate, pass its exact URL and photographer/source label so attribution is saved.",
    'Three.js: update_clip {itemId,threeScene} applies a 3D scene to video/broll; null restores footage. Scene: {version:1,background:"#080e1e",camera:{position:[0,1,6],target:[0,0,0],orbitSpeed:0.1},objects:[{id:"globe",geometry:"sphere",color:"#38bdf8",spin:[0,0.2,0]}]}. Up to 64 objects; geometry box|sphere|torus|cone|cylinder|plane; optional position,rotation (radians),scale,spin,wireframe,metalness,roughness,keyframes:[{time_sec,position?,rotation?,scale?}]. Keyframe times increase, scale positive. No JavaScript, shaders or URLs. Existing captions/transitions/SFX work with 3D; add_sfx separately.',
    "update_motion_template edits a full-frame A-roll scene or an existing overlay in place; prefer it over delete+add.",
    "update_caption_style.style: cinematic | clean_highlight | kinetic | editorial | bold_static | karaoke | boxed_pill | minimal | neon | typewriter",
    "add_graphic: frame | bar_chart | shape with optional relative keyframes in seconds. Chart data must be supplied facts; keyframe limit 100.",
    "Audio volumes are normalized 0–1; 0.6 means 60%. Sound presets: soft_whoosh | soft_impact | editorial_tick.",
    "set_theme.themeId: crime | history | modern | minimalist | standard",
    "toggle_track_hidden.trackType: video | broll | text | captions | animation | music | sfx | narration",
    "Layering: bring_to_front / send_to_back; visibility: toggle_item_hidden; clip audio: set_clip_muted.",
    "Times are milliseconds.",
  ].join("\n");
}
