/**
 * Editor Agent v1 — allowed store operations.
 *
 * STRUCTURAL TTS BAN: narration / voiceover / TTS ops are intentionally absent.
 * Do not add regenerate_voice, update_narration, replace_narration, or similar.
 */

import type { TimelineSettings, TransitionType } from "../types";
import { useEditorStore } from "../store";

export const AGENT_OP_NAMES = [
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
  "update_settings",
  "toggle_captions",
  "select_item",
  "set_playhead",
] as const;

export type AgentOpName = (typeof AGENT_OP_NAMES)[number];

/** Ops that must never appear in the agent schema (documentation + runtime guard). */
export const BANNED_TTS_OP_NAMES = [
  "regenerate_voice",
  "regenerate_narration",
  "synthesize_speech",
  "update_narration",
  "replace_narration",
  "delete_narration",
  "set_narration_volume",
  "change_voice",
  "tts",
] as const;

export type AgentOp =
  | { op: "delete_item"; itemId: string }
  | { op: "move_item"; itemId: string; startMs: number }
  | { op: "trim_item"; itemId: string; startMs: number; endMs: number }
  | { op: "replace_media"; itemId: string; url: string }
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
      label?: string;
      url?: string;
      startMs?: number;
      durationMs?: number;
      volume?: number;
    }
  | {
      op: "add_broll";
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
      op: "update_settings";
      patch: Partial<
        Pick<
          TimelineSettings,
          | "backgroundColor"
          | "backgroundImage"
          | "overlayDropShadow"
          | "musicVolume"
          | "sfxVolume"
          | "clipAudioVolume"
          | "captionsEnabled"
          | "showTransitions"
        >
      >;
    }
  | { op: "toggle_captions"; enabled: boolean }
  | { op: "select_item"; itemId: string }
  | { op: "set_playhead"; ms: number };

export interface AgentOpResult {
  ok: boolean;
  summary: string;
  error?: string;
}

function findItemLabel(itemId: string): string {
  const state = useEditorStore.getState();
  for (const track of state.timeline.tracks) {
    const item = track.items.find((i) => i.id === itemId);
    if (item) return item.label || item.id;
  }
  return itemId;
}

function isNarrationItem(itemId: string): boolean {
  const state = useEditorStore.getState();
  for (const track of state.timeline.tracks) {
    const item = track.items.find((i) => i.id === itemId);
    if (item) return item.type === "narration";
  }
  return false;
}

/** Runtime guard — rejects banned / unknown ops even if LLM invents them. */
export function assertAllowedOp(raw: unknown): AgentOp | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const op = typeof src.op === "string" ? src.op.trim() : "";
  if (!op) return null;
  const lower = op.toLowerCase();
  if ((BANNED_TTS_OP_NAMES as readonly string[]).includes(lower)) return null;
  if (lower.includes("narrat") || lower.includes("voice") || lower.includes("tts")) return null;

  const camel: Record<string, unknown> = { ...src };
  const aliases: Record<string, string> = {
    item_id: "itemId",
    after_item_id: "afterItemId",
    after_clip_id: "afterItemId",
    transition_id: "transitionId",
    start_ms: "startMs",
    end_ms: "endMs",
    duration_ms: "durationMs",
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

  const finalOp = String(camel.op || "");
  if (!(AGENT_OP_NAMES as readonly string[]).includes(finalOp)) return null;
  return camel as unknown as AgentOp;
}

export function applyAgentOp(op: AgentOp): AgentOpResult {
  const store = useEditorStore.getState();

  switch (op.op) {
    case "delete_item": {
      if (isNarrationItem(op.itemId)) {
        return {
          ok: false,
          summary: "Refused",
          error: "Cannot delete narration via the agent (TTS boundary).",
        };
      }
      const label = findItemLabel(op.itemId);
      const ok = store.deleteItem(op.itemId);
      return ok
        ? { ok: true, summary: `Deleted “${label}”` }
        : { ok: false, summary: "Delete failed", error: "Item not found" };
    }
    case "move_item": {
      if (isNarrationItem(op.itemId)) {
        return { ok: false, summary: "Refused", error: "Cannot move narration via the agent." };
      }
      store.moveItem(op.itemId, op.startMs);
      return { ok: true, summary: `Moved “${findItemLabel(op.itemId)}” to ${(op.startMs / 1000).toFixed(1)}s` };
    }
    case "trim_item": {
      if (isNarrationItem(op.itemId)) {
        return { ok: false, summary: "Refused", error: "Cannot trim narration via the agent." };
      }
      store.trimItem(op.itemId, op.startMs, op.endMs);
      return {
        ok: true,
        summary: `Trimmed “${findItemLabel(op.itemId)}” to ${((op.endMs - op.startMs) / 1000).toFixed(1)}s`,
      };
    }
    case "replace_media": {
      if (isNarrationItem(op.itemId)) {
        return { ok: false, summary: "Refused", error: "Cannot replace narration media via the agent." };
      }
      store.addAssetFromUrl(op.url, op.itemId);
      return { ok: true, summary: `Replaced media on “${findItemLabel(op.itemId)}”` };
    }
    case "add_caption": {
      const id = store.addCaption(op.text, op.startMs, op.durationMs);
      return { ok: true, summary: `Added caption “${op.text.slice(0, 40)}” (${id})` };
    }
    case "add_text": {
      store.addTextOverlay();
      const selected = useEditorStore.getState().ui.selectedItemId;
      if (selected && op.text) {
        useEditorStore.getState().updateTextItem(selected, { text: op.text });
        if (op.startMs != null || op.durationMs != null) {
          const item = useEditorStore.getState().getSelectedItem();
          if (item) {
            const start = op.startMs ?? item.startMs;
            const end = start + (op.durationMs ?? item.endMs - item.startMs);
            useEditorStore.getState().trimItem(item.id, start, end);
          }
        }
      }
      return { ok: true, summary: `Added text overlay${op.text ? ` “${op.text.slice(0, 40)}”` : ""}` };
    }
    case "update_text": {
      store.updateTextItem(op.itemId, {
        text: op.text,
        fontSize: op.fontSize,
        color: op.color,
        fontWeight: op.fontWeight,
        alignment: op.alignment,
      });
      return { ok: true, summary: `Updated text on “${findItemLabel(op.itemId)}”` };
    }
    case "update_text_position": {
      store.updateTextPosition(op.itemId, op.x, op.y);
      return { ok: true, summary: `Repositioned “${findItemLabel(op.itemId)}”` };
    }
    case "add_music": {
      const id = store.addMusic(op);
      return { ok: true, summary: `Added music clip (${id})` };
    }
    case "add_sfx": {
      const id = store.addSfx(op);
      return { ok: true, summary: `Added SFX (${id})` };
    }
    case "add_broll": {
      const id = store.addBroll(op);
      return { ok: true, summary: `Added B-roll (${id})` };
    }
    case "set_volume": {
      if (isNarrationItem(op.itemId)) {
        return {
          ok: false,
          summary: "Refused",
          error: "Cannot change narration volume via the agent (TTS boundary).",
        };
      }
      store.updateAudioVolume(op.itemId, op.volume);
      return { ok: true, summary: `Set volume on “${findItemLabel(op.itemId)}” to ${op.volume}` };
    }
    case "add_transition": {
      const id = store.addTransition(op.afterItemId, op.type, op.durationMs);
      return id
        ? { ok: true, summary: `Added ${op.type} transition after “${findItemLabel(op.afterItemId)}”` }
        : { ok: false, summary: "Transition failed", error: "Clip not found" };
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
    case "update_settings": {
      // Strip any narrationVolume if sneaked in
      const { narrationVolume: _banned, ...safe } = op.patch as Partial<TimelineSettings> & {
        narrationVolume?: number;
      };
      void _banned;
      store.updateSettings(safe);
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
  }
}

export function applyAgentOps(ops: AgentOp[]): AgentOpResult[] {
  return ops.map((op) => {
    const allowed = assertAllowedOp(op);
    if (!allowed) {
      return {
        ok: false,
        summary: "Blocked",
        error: "Operation not in agent allow-list (TTS/voice ops are banned).",
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
    "NEVER emit narration/voice/TTS operations. If the user asks to change voiceover, set ops=[] and explain in reply that voiceover edits are outside the agent.",
    "Transition types: zoom | slide-pan | film-burn | glitch | fade | slide | cut",
    "Animation presets include: subscribe-cta",
    "Times are milliseconds.",
  ].join("\n");
}
