# Phase 3 — Preview fidelity (effects users actually notice)

## Approach (ADR 0009)

No full Remotion Player in the editor. Improve CSS approximations for
film-burn / glitch / subscribe-cta, and **label** when the preview is approximate.

## Changes

| Area | Change |
|------|--------|
| `preview-transition.ts` | Richer film-burn (sepia layers + scratch) and glitch (shake/chroma) scrub |
| `preview-motion.ts` | Default pop+pulse for Subscribe CTA; slide/fade for chapter titles |
| Preview chrome | Amber “Approximate preview” chip when those effects are under the playhead |
| Transitions panel | `~prev` on approximate types; footnote updated (Remotion export, not FFmpeg-only) |
| `export-honesty.ts` | Transition + motion-preset preview notes |

## Still approximate by design

Film-burn / glitch Remotion shaders, particle detail, exact CTA timing curves — export remains richer.
