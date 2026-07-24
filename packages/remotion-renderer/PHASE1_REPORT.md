# Phase 1 — Local Remotion proof (pause for review)

**Date:** 2026-07-14  
**Package:** `packages/remotion-renderer`  
**ADR:** [0009-remotion-render-path.md](../../docs/adr/0009-remotion-render-path.md)

## Delivered

| Item | Status |
|------|--------|
| ADR 0009 + 0003/0007 notes | Done |
| `TimelineComposition` reads **timeline.v1** props | Done |
| Timing via `src/lib/timing.ts` (`secToFrames` / absolute `start_sec`) | Done |
| A-roll `TransitionSeries` + captions/broll/overlays `Sequence` | Done |
| Animation preset library (`src/presets/animations.ts`) | Done |
| Transition map + film-burn / glitch customs | Done — see `TRANSITION_MAPPING.md` |
| Local MP4 proof | **`out/phase1-proof.mp4`** (gitignored; re-run `pnpm render:proof`) |

## Render command that worked

```bash
cd packages/remotion-renderer
pnpm exec remotion render src/index.ts TimelineComposition out/phase1-proof.mp4 \
  --props=fixtures/phase1-proof.props.json \
  --browser-executable="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

(Chrome Headless Shell download can stall on this machine; system Chrome works.)

## Proof probe

- **1920×1080** h264 + aac  
- **~5.06 s** (150 frames @ 30fps)  
- ~576 KB  
- Fixture covers: dissolve + **film-burn**, fade/zoom_in/pop/bounce/ken_burns anims, caption, broll inset, Subscribe CTA

## Not in this Phase 1 slice

- Full “E2E 10min Indian Fighters” parity vs last FFmpeg export (needs real asset URLs + Temporal wiring)
- Remotion Lambda / AWS
- Replacing `render_video` activity

## Pause

Approve to continue **Phase 2 (Remotion Lambda)** or expand Phase 1 to a real project manifest first.
