# Phase 2 — Duration display fidelity

## Problem

`timeline.durationMs` / `metadata.duration_sec` used max clip end (no transition overlaps). Remotion TransitionSeries / FFmpeg xfade shorten wall clock by Σ transition durations → silent ~3–4s gap felt like a bug.

## Fix

| Piece | Change |
|-------|--------|
| Estimate | `export-duration.ts` `estimateExportDurationMs` (sum video − enabled transitions) |
| Export metadata | `build-timeline-manifest` writes overlap-aware `metadata.duration_sec` |
| Post-render actual | Media worker probes MP4; stores `metadata.duration_sec` on `final_video` artifact |
| API | `ArtifactResponse.durationSec` from artifact metadata |
| Editor UI | Timecode total shows **est.** export length, or **render** once last MP4 duration is known |

Timeline scrub canvas still uses full `durationMs` (absolute clip ends).

## Billing

Credits use quote `target_duration_sec` / `creditEstimate` at quote time — not editor estimate or post-render length. No change required for MVP (billing enforcement out of scope).

## Verify

```bash
cd packages/remotion-renderer
pnpm exec tsx ../../apps/web/src/lib/editor/export-duration.roundtrip.ts
```
