# ADR 0004: Editor Agent v1 (chat-based timeline edits)

## Status

Accepted (product override of ADR 0003 post-MVP deferral)

## Date

2026-07-10

## Context

ADR 0003 deferred chat-based editing to post-MVP. Product now requires a Vidrush-style editor agent for timeline commands (captions, transitions, B-roll, music, motion graphics) without waiting for a full NLE.

## Decision

Ship **Editor Agent v1** as a thin hybrid layer:

1. **Local intent** for high-confidence common commands (no LLM round-trip).
2. **LLM planner** via OpenRouter (`POST /projects/{id}/editor-agent/plan`) returning structured ops.
3. **Client apply** through a fixed allow-list of store ops (`apps/web/src/lib/editor/agent/ops.ts`).

### Hard boundary — TTS / voiceover

The agent **must not** regenerate narration, call TTS, or mutate the narration track via agent ops. Enforcement is structural:

- Banned op names are absent from `AGENT_OP_NAMES` / API `ALLOWED_OPS`
- Runtime `assertAllowedOp` rejects narration/voice/tts substrings
- Apply layer refuses delete/move/trim/replace/volume on narration items
- Local + API intent layers refuse voiceover-shaped user requests before planning

### UI

Right dock beside the preview (`EditorAgentDock`), toggled from the top toolbar.

## Consequences

- Chat editing is available in the editor without expanding media-worker TTS surface.
- Complex natural-language edits depend on OpenRouter availability; local commands still work offline of the LLM.
- ADR 0003’s “Chat-based editing → Post-MVP” row is superseded for this thin agent only — full conversational NLE remains out of scope.
