# ADR 0009: Remotion (+ Lambda) as export render path

## Status

Accepted (reverses FFmpeg-only export constraint of ADR 0001 / 0003 / 0007 for **final MP4** rendering)

## Date

2026-07-14

## Context

Phase 0 of the Remotion migration found:

- Remotion was **never** the server render stack; FFmpeg-native was chosen day-one for MVP speed and determinism.
- Sequential FFmpeg `xfade` chaining is O(n²) and stalls long exports; progress UI looks frozen.
- Product now wants Vidrush-class motion (transitions, animation presets) and cloud-parallel rendering via **Remotion Lambda**.

ADR 0007 remains the schema owner for `transform` / `animation` / `transitions[]` on **timeline.v1**. Remotion is a new **render consumer**, not a second authoring model.

## Decision

1. **SSOT:** `packages/timeline-schema/schema/timeline.v1.json` (absolute `start_sec` / `duration_sec`). No parallel MasterTimeline; no inventing `toAbsoluteTimeline` — frame conversion is `round(sec * fps)` in one shared timing helper.
2. **Local proof first:** `packages/remotion-renderer` renders the same manifest locally (`npx remotion render`) before Lambda.
3. **Orchestration:** keep Temporal `VideoRenderWorkflow` / `render_video`; implementation may call Remotion (local CLI or Lambda) instead of / beside FFmpeg, behind a feature flag during migration.
4. **FFmpeg:** may remain for audio mix / fallback; primary picture compositing moves to Remotion.
5. **Lambda (Phase 2+):** AWS S3 + Remotion Lambda; MinIO stays local-dev artifact store until AWS is wired.
6. **Feature flag (Phase 3 + Remotion-only product path):** `RENDER_ENGINE=ffmpeg|auto|remotion-local|remotion-lambda`.
   - **Product / video editor default:** `remotion-local` (or `auto` ≡ local) — **always Remotion**, including hard-cut-only timelines, so editor polish → MP4 is one engine ([VidRush-style](https://docs.vidrush.ai/docs) review → render).
   - `remotion-lambda` — same Remotion-only contract on Lambda when IAM is ready.
   - `ffmpeg` — **ops force only**, not the editor product path.
   - `RENDER_FFMPEG_FALLBACK` defaults **false** for product (no silent FFmpeg MP4). Progress events stream during Remotion renders.

## Consequences

- New Node package and Chromium-based renders (ops + Remotion license for commercial use).
- ADRs 0001/0003/0007 notes updated: “no Remotion” no longer applies to **export**.
- Editor preview defaults to `@remotion/player` (`NEXT_PUBLIC_PREVIEW_ENGINE=remotion`) sharing `TimelineComposition` with export; HTML audio transport stays SSOT (`muteAudio`). Opt out with `NEXT_PUBLIC_PREVIEW_ENGINE=css`.

## Non-goals (this ADR)

- Billing / credit enforcement
- Full NLE
- Partial segment re-render (evaluate after Lambda timing data)

## Related

- [0001-monorepo-and-temporal.md](./0001-monorepo-and-temporal.md)
- [0003-mvp-scope.md](./0003-mvp-scope.md)
- [0007-element-transform-animation.md](./0007-element-transform-animation.md)

## Appendix — Lambda timeout fix (2026-07-24)

**Root cause:** Fixed ~0.15–0.28s/frame Remotion capture overhead made ~6500-frame chunks (4-way split) exceed AWS 900s.

**Known-good production config:** 8 frame Lambdas, planner ~2800 fpl (cap 3000), `concurrencyPerLambda=2`, memory 3008, timeout 900. Working function name may still say `…120sec` while live values are 3008/900.

**Validated:** Indian Fighters stills (fixtures + S3 network) and WW2 OffthreadVideo clamped slice — longest chunks 439–551s. See `infrastructure/remotion-lambda/README.md` § Known-good config. Future timeout reports should start from that baseline.
