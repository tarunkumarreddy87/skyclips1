# Phase 1 — Subscribe CTA persistence (editor↔export)

## Problem

Editor load remapped manifests with a **caption-text heuristic** (`SIGNOFF_RE`) that could invent a `subscribe-cta` animation item in memory without writing `overlays[]` until a later edit. Agent/store already persisted correctly; UI could still disagree after reload.

## Fix

| Change | Path |
|--------|------|
| Map `overlays[]` only — no caption invent | `apps/web/src/lib/editor/manifest-mapper.ts` (`mapMotionOverlays`) |
| Agent `addAnimation` writes CTA with corner transform + triggers autosave | `apps/web/src/lib/editor/store.ts` |
| Generation still may **persist** CTA into timeline.v1 when script signs off | `timeline_transitions.detect_subscribe_overlay` (doc clarified: generation write, not load invent) |
| Round-trip regression | `apps/web/src/lib/editor/cta-persistence.roundtrip.ts` |

## Verify

```bash
cd packages/remotion-renderer
pnpm exec tsx ../../apps/web/src/lib/editor/cta-persistence.roundtrip.ts
# → cta-persistence.roundtrip: PASS
```

Manual: Editor Agent → “Add a subscribe CTA” → wait for Saved → reload editor → CTA still on animation track and in timeline overlays.

## Not in Phase 1

Duration display, preview fidelity badge, autosave clarity, smart engine selection (Phases 2–5).
