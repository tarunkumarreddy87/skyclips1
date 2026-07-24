# Phase 3 — Temporal integration (feature-flagged)

## What changed

| Piece | Change |
|-------|--------|
| `workers/media` `render_video` | Branches on `RENDER_ENGINE` |
| `src/render/remotion_bridge.py` | Spawns Remotion Node bridge, streams progress → SSE |
| `packages/remotion-renderer/src/bridge/job.ts` | `remotion-local` (bundle+render) or `remotion-lambda` (poll `getRenderProgress`) |
| Output | Always uploaded to existing key `projects/{id}/runs/{id}/final.mp4` (MinIO/S3 artifacts) |

## Default behavior

`RENDER_ENGINE=ffmpeg` — **unchanged** production path.

## Enable Remotion

```env
# Local Chromium render (no AWS)
RENDER_ENGINE=remotion-local
RENDER_FFMPEG_FALLBACK=true
REMOTION_BROWSER_EXECUTABLE=C:\Program Files\Google\Chrome\Application\chrome.exe

# After Lambda IAM + deploy:
# RENDER_ENGINE=remotion-lambda
# REMOTION_AWS_ACCESS_KEY_ID=...
# REMOTION_SERVE_URL=...
# REMOTION_FUNCTION_NAME=...
```

Restart the **media** worker after changing env.

## Progress wiring

Bridge emits NDJSON `{type:progress,percent,message}`. Media worker POSTs `/internal/progress-events` (stage `enqueue_render`, percent 86–99). UI SSE picks these up — fixes the “stuck at 85%” feel for Remotion paths.

## Fallback

If Remotion fails and `RENDER_FFMPEG_FALLBACK=true` (default), the activity logs a warning and runs the classic FFmpeg pipeline.

## Not done (blocked on AWS IAM)

- Live `remotion-lambda` deploy/render
- Phase 4 partial re-render decision
- Phase 5 full “Indian Fighters” Lambda acceptance

## Smoke (optional)

```bash
# With media worker env RENDER_ENGINE=remotion-local, trigger editor Render
# Or unit-ish bridge:
cd packages/remotion-renderer
# write a job.json pointing at fixtures/phase1-proof.json then:
pnpm exec tsx src/bridge/job.ts --job=...
```
