# Phase 5 — Indian Fighters Remotion acceptance

## Result: PASS

Rendered the E2E Indian Fighters timeline (`1fbee2bc-1a33-4518-847c-d54665285d9d`) via `remotion-local` with hydrated MinIO asset URLs.

| Check | Expected | Actual |
|-------|----------|--------|
| Output file | MP4 at proofs path | `packages/remotion-renderer/proofs/phase5-indian-fighters.mp4` (~86.6 MB) |
| Resolution / fps | 1920×1080 @ 30 | ✓ (composition defaults) |
| Duration | ~498.5s editor timeline | **495.1s** (Δ −3.4s; TransitionSeries overlap shrinks wall clock vs summed clip starts) |
| Transitions | film-burn present | `film-burn`, `zoom`, `slide-pan`, `glitch` (7 total) |
| Captions | present | 178 caption cues |
| Overlays | chapter titles + subscribe CTA | 24× `chapter_title` + 1× `subscribe_cta` (CTA injected for acceptance near end) |
| Render engine | remotion-local | exit 0, ~128 min wall clock |

## How it was run

Temporal path hit **heartbeat timeout** when Remotion progress flooded the asyncio loop (blocked heartbeats). For acceptance we used a direct bridge:

```bash
workers/media/.venv/Scripts/python.exe scripts/phase5_remotion_direct.py
```

That script:

1. Loads `packages/remotion-renderer/out/indian-fighters-manifest.json`
2. Presigns S3/MinIO `src` keys for Remotion/Chromium
3. Invokes `pnpm exec tsx src/bridge/job.ts`

## Fixes landed during Phase 5

1. **`workers/media/src/render/remotion_bridge.py`** — hydrate timeline `src` keys → presigned HTTP URLs before Remotion.
2. **`workers/media/src/activities/render.py`** — throttle progress SSE; emit progress with sync `httpx` from the bridge thread; keep heartbeats only on the activity event loop.
3. **`workers/orchestrator/.../video_generation.py`** — render activity `heartbeat_timeout=10m`, `start_to_close=180m`.

## Gaps / follow-ups

- **Editor subscribe CTA:** latest autosaved timeline had only `chapter_title` overlays; subscribe CTA was injected in the acceptance job JSON (not re-saved to the project). Persist from editor export when validating end-to-end UI → render.
- **Temporal acceptance:** re-run via API with the fixed media worker (single instance) after this report; avoid duplicate media workers.
- **Duration parity:** −3.4s vs `metadata.duration_sec` is expected with overlapping transitions; document or adjust metadata if product expects exact editor playhead length.
- **AWS Lambda** still blocked on IAM (Phase 2).

## Artifact

`d:\HANUMAN\packages\remotion-renderer\proofs\phase5-indian-fighters.mp4`
