# Editor QA — 2026-09-19

Scope: video editor timeline, transport, keyboard shortcuts and agent lifecycle.

## Fixes in this audit

- Keyboard shortcuts now respect prevented/composing events and focused interactive controls. Previously dropdown arrow keys could seek playback, and dialog keys could affect the timeline behind the dialog.
- Desktop agent panel stays mounted when closed, preserving drafts, conversation and pending approval state.
- Fallback playback clock distinguishes external seeks from its own throttled writes. Previously the local clock could repeatedly reset to its own older store position.
- Agent plan approval tolerates preview-only changes such as zoom while rejecting changed tracks, transitions, duration, FPS, transition export setting and assets.
- Agent image previews remain valid for the lifetime of the chat. Clearing a pending attachment no longer revokes a sent message's preview or cancels progress timers. URLs are released on chat reset/unmount.

## Verification

- TypeScript: `pnpm exec tsc --noEmit` passed after edits.
- Passed assertion suites: editing-regression, store, timeline-layout, resize-geometry, playable-video-end, browser-video-source, agent/op-validation.
- Live editor loaded successfully; agent was closed initially. Open/close and draft checks were exercised at the available viewport.
- Both audio waveform elements reported `ready`, 1659 bars, and approximately 26.4px height; narration bars and the quieter music trace were visible.
- Browser error log query returned no captured errors at the time checked.

## Limits

The fixes involving agent uploads/approvals, desktop panel persistence, and the native playback were source-verified and type-checked; they were not fully exercised end-to-end. No paid agent request, video render, upload, or destructive timeline test was submitted against the user's project. This audit does not establish that every possible editor bug is eliminated.
