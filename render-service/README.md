# HANUMAN native render service

The job service runs our shared SVG graphics runtime and native FFmpeg media
pipeline on a container worker. The browser editor keeps its layout. A render
uses TypeScript/Resvg for captions, typography, frames, charts and vector objects;
Python/FFmpeg handles footage, audio, transitions, encoding and artifact upload.

## Run

Install workspace Node dependencies with `pnpm install`. Install the media worker
and its shared Python package into a Python 3.12 environment. Configure artifact
storage, then run `pnpm --filter @hanuman/render-service dev`. Docker images include
both runtimes and bundled fonts. There is no browser capture or Lambda deployment.

| Method | Path | Behavior |
|---|---|---|
| POST | `/render/start` | Queue manifest and output artifact key; supports external idempotency key |
| GET | `/render/:id/status` | Progress, native engine and encoder metadata |
| GET | `/render/:id/result` | Output artifact and measured duration |
| DELETE | `/render/:id` | Cancel queued job or terminate worker process tree |
| GET | `/health` | Service liveness and active job count |

## Configuration

- `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` configure artifacts. Without an endpoint or static keys, AWS uses the task IAM role.
- `RENDER_PYTHON_EXECUTABLE` optionally selects Python; repository `.venv` is detected locally.
- `RENDER_ENCODER=auto` probes an actual NVIDIA encode; unavailable GPU hardware falls back to `libx264`.
- `RENDER_PARALLEL_SECTIONS=2` bounds section workers; `RENDER_MAX_CONCURRENT=1` bounds jobs.
- `RENDER_JOB_MAX_RETRIES=1`, `RENDER_JOB_TIMEOUT_MS=7200000` bound retry and runtime.
- `RENDER_SERVICE_API_KEY` protects render endpoints; health probes remain available.
- `REDIS_URL` enables durable jobs; `RENDER_GLOBAL_MAX_CONCURRENT` limits jobs across replicas.
- `S3_PUBLIC_ENDPOINT` sets browser-accessible result URLs for local object storage.
- `RENDER_CACHE_DIR` enables content-addressed completed-section caching on mounted storage.

## Current limits

Configured Redis persists jobs with leases, shared capacity and owner-fenced updates.
Restart recovery renders from persisted manifests; graceful shutdown stops process trees.
Memory mode is for development without Redis. Completed artifacts persist in storage. Section caches require mounted storage and have no
automatic eviction yet. Graphics rasterization is CPU based, and composition fuses media, transitions and graphics into one FFmpeg encode per section; this is not a zero-copy GPU pipeline. A GPU container
requires a compatible FFmpeg build, NVIDIA driver/runtime and device access.
Quality and speed targets need representative long-video cloud benchmarks.

`pnpm --filter @hanuman/render-service typecheck` and
`pnpm --filter @hanuman/render-service test` validate service contracts. Real local
media/graphics export tests are in `workers/media/tests/test_native_export.py`.
