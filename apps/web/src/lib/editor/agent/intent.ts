import type { AgentOp } from "./ops";
import type { TransitionType } from "../types";
import { useEditorStore } from "../store";

export interface LocalIntentResult {
  kind: "ops" | "refuse_tts" | "none";
  ops: AgentOp[];
  reply: string;
  confidence: number;
}

const TTS_REFUSE_RE =
  /\b(voiceover|voice[\s-]?over|narrat(ion|or|e)|tts|text[\s-]?to[\s-]?speech|sarvam|regenerate\s+(the\s+)?(voice|audio|speech)|make\s+(the\s+)?narrator|change\s+(the\s+)?voice|re[\s-]?synthesize)\b/i;

const TRANSITION_MAP: Array<{ re: RegExp; type: TransitionType }> = [
  { re: /\b(film[\s-]?burn|filmburn)\b/i, type: "film-burn" },
  { re: /\b(slide[\s-]?pan|slidepan)\b/i, type: "slide-pan" },
  { re: /\bglitch\b/i, type: "glitch" },
  { re: /\bzoom\b/i, type: "zoom" },
  { re: /\bfade\b/i, type: "fade" },
  { re: /\bslide\b/i, type: "slide" },
  { re: /\bcut\b/i, type: "cut" },
];

function resolveTargetItemId(): string | null {
  const state = useEditorStore.getState();
  if (state.ui.selectedItemId) return state.ui.selectedItemId;
  const playhead = state.ui.playheadMs;
  for (const trackType of ["broll", "video", "captions", "text", "music", "sfx", "animation"] as const) {
    const track = state.timeline.tracks.find((t) => t.type === trackType);
    if (!track) continue;
    for (const item of track.items) {
      if (item.hidden) continue;
      if (playhead >= item.startMs && playhead < item.endMs) return item.id;
    }
  }
  return null;
}

function resolveAfterClipId(): string | null {
  const state = useEditorStore.getState();
  const selected = state.ui.selectedItemId;
  if (selected) {
    for (const track of state.timeline.tracks) {
      const item = track.items.find((i) => i.id === selected);
      if (item && (item.type === "video" || item.type === "broll")) return item.id;
    }
  }
  const playhead = state.ui.playheadMs;
  const videoTrack = state.timeline.tracks.find((t) => t.type === "video");
  if (!videoTrack) return null;
  let best: string | null = null;
  for (const item of videoTrack.items) {
    if (item.endMs <= playhead + 50) best = item.id;
  }
  return best ?? videoTrack.items[0]?.id ?? null;
}

function quotedText(message: string): string | null {
  const m = message.match(/["“](.+?)["”]/) || message.match(/'(.+?)'/);
  return m?.[1]?.trim() || null;
}

export function matchLocalIntent(message: string): LocalIntentResult {
  const text = message.trim();
  if (!text) {
    return { kind: "none", ops: [], reply: "", confidence: 0 };
  }

  if (TTS_REFUSE_RE.test(text)) {
    return {
      kind: "refuse_tts",
      ops: [],
      reply:
        "I can’t change voiceover or regenerate narration — that’s outside the editor agent (TTS boundary). Edit captions/text on the timeline, or re-run generation from the project page if you need a new voice track.",
      confidence: 1,
    };
  }

  // delete / remove this
  if (/\b(delete|remove|cut out)\b.+\b(this|clip|item|overlay|caption|b-?roll|music|sfx)\b/i.test(text) ||
      /^(delete|remove)\s+(this|it)\b/i.test(text)) {
    const itemId = resolveTargetItemId();
    if (!itemId) {
      return {
        kind: "ops",
        ops: [],
        reply: "Select a clip first, or park the playhead on one, then ask me to delete it.",
        confidence: 0.9,
      };
    }
    return {
      kind: "ops",
      ops: [{ op: "delete_item", itemId }],
      reply: "Removing the selected/active clip.",
      confidence: 0.95,
    };
  }

  // add caption
  if (/\badd\b.+\bcaption\b/i.test(text) || /^caption\b/i.test(text)) {
    const body = quotedText(text) || "New caption";
    return {
      kind: "ops",
      ops: [{ op: "add_caption", text: body }],
      reply: `Adding caption “${body}” at the playhead.`,
      confidence: 0.95,
    };
  }

  // add text overlay
  if (/\badd\b.+\b(text|overlay|title)\b/i.test(text)) {
    const body = quotedText(text) || "Your text here";
    return {
      kind: "ops",
      ops: [{ op: "add_text", text: body }],
      reply: `Adding text overlay “${body}”.`,
      confidence: 0.9,
    };
  }

  // add music
  if (/\badd\b.+\bmusic\b/i.test(text)) {
    return {
      kind: "ops",
      ops: [{ op: "add_music", label: "Music bed" }],
      reply: "Adding a music bed at the playhead.",
      confidence: 0.9,
    };
  }

  // add broll
  if (/\badd\b.+\bb-?roll\b/i.test(text) || /\badd\b.+\bimage\b/i.test(text)) {
    return {
      kind: "ops",
      ops: [{ op: "add_broll", label: "B-roll" }],
      reply: "Adding B-roll at the playhead.",
      confidence: 0.9,
    };
  }

  // add subscribe CTA
  if (/\b(subscribe|cta)\b/i.test(text) && /\b(add|show|place)\b/i.test(text)) {
    const target = resolveTargetItemId();
    const state = useEditorStore.getState();
    let startMs = state.ui.playheadMs;
    if (target) {
      for (const track of state.timeline.tracks) {
        const item = track.items.find((i) => i.id === target);
        if (item) {
          startMs = item.startMs;
          break;
        }
      }
    }
    return {
      kind: "ops",
      ops: [{ op: "add_animation", preset: "subscribe-cta", startMs }],
      reply: target
        ? "Adding a Subscribe CTA timed to the selected clip."
        : "Adding a Subscribe CTA overlay.",
      confidence: 0.9,
    };
  }

  // motion graphic / animation on selected clip
  if (
    /\b(motion\s*graphic|motion\s*graphics|add\s+animation|animated\s+overlay|lower\s*third)\b/i.test(
      text,
    )
  ) {
    const target = resolveTargetItemId();
    const state = useEditorStore.getState();
    let startMs = state.ui.playheadMs;
    let label = "the playhead";
    if (target) {
      for (const track of state.timeline.tracks) {
        const item = track.items.find((i) => i.id === target);
        if (item) {
          startMs = item.startMs;
          label = `“${item.label}”`;
          break;
        }
      }
    }
    const preset = /\blower\s*third\b/i.test(text) ? "lower-third" : "subscribe-cta";
    return {
      kind: "ops",
      ops: [{ op: "add_animation", preset, startMs }],
      reply: `Adding a motion graphic on ${label}.`,
      confidence: 0.92,
    };
  }

  // captions on/off
  if (/\b(hide|disable|turn off)\b.+\bcaptions?\b/i.test(text)) {
    return {
      kind: "ops",
      ops: [{ op: "toggle_captions", enabled: false }],
      reply: "Hiding captions.",
      confidence: 0.95,
    };
  }
  if (/\b(show|enable|turn on)\b.+\bcaptions?\b/i.test(text)) {
    return {
      kind: "ops",
      ops: [{ op: "toggle_captions", enabled: true }],
      reply: "Showing captions.",
      confidence: 0.95,
    };
  }

  // background color
  const bg = text.match(/\b(?:background|canvas)\b.*?(#[0-9a-fA-F]{3,8}|black|white)\b/i);
  if (bg) {
    const raw = bg[1].toLowerCase();
    const color = raw === "black" ? "#000000" : raw === "white" ? "#ffffff" : raw;
    return {
      kind: "ops",
      ops: [{ op: "update_settings", patch: { backgroundColor: color } }],
      reply: `Set background to ${color}.`,
      confidence: 0.9,
    };
  }

  // transition
  if (/\btransition\b/i.test(text) || TRANSITION_MAP.some((t) => t.re.test(text) && /\b(use|set|add|make|change)\b/i.test(text))) {
    let type: TransitionType | null = null;
    for (const entry of TRANSITION_MAP) {
      if (entry.re.test(text)) {
        type = entry.type;
        break;
      }
    }
    if (type) {
      const state = useEditorStore.getState();
      if (state.ui.selectedTransitionId) {
        return {
          kind: "ops",
          ops: [{ op: "set_transition", transitionId: state.ui.selectedTransitionId, type, durationMs: 500 }],
          reply: `Changing selected transition to ${type}.`,
          confidence: 0.95,
        };
      }
      const afterItemId = resolveAfterClipId();
      if (!afterItemId) {
        return {
          kind: "ops",
          ops: [],
          reply: "Couldn’t find a clip boundary for the transition. Select a video clip first.",
          confidence: 0.85,
        };
      }
      if (type === "cut") {
        const existing = state.timeline.transitions.find((t) => t.afterItemId === afterItemId && t.enabled);
        if (existing) {
          return {
            kind: "ops",
            ops: [{ op: "remove_transition", transitionId: existing.id }],
            reply: "Removing transition (hard cut).",
            confidence: 0.9,
          };
        }
      }
      return {
        kind: "ops",
        ops: [{ op: "add_transition", afterItemId, type, durationMs: 500 }],
        reply: `Adding ${type} transition after the active clip.`,
        confidence: 0.9,
      };
    }
  }

  // remove transition
  if (/\b(remove|delete|clear)\b.+\btransition\b/i.test(text)) {
    const state = useEditorStore.getState();
    const tid =
      state.ui.selectedTransitionId ||
      state.timeline.transitions.find((t) => t.enabled && t.transitionType !== "cut")?.id;
    if (!tid) {
      return { kind: "ops", ops: [], reply: "No active transition to remove.", confidence: 0.85 };
    }
    return {
      kind: "ops",
      ops: [{ op: "remove_transition", transitionId: tid }],
      reply: "Removing transition.",
      confidence: 0.9,
    };
  }

  return { kind: "none", ops: [], reply: "", confidence: 0 };
}
