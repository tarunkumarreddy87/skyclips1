# Remotion Lambda AWS Infrastructure

Production rendering infrastructure for HANUMAN using [Remotion Lambda](https://www.remotion.dev/docs/lambda).

## Components

| Resource | Purpose |
|----------|---------|
| **Lambda function** | Parallel frame-chunk rendering + stitch |
| **S3 bucket** (Remotion-managed) | Site bundle + render intermediates + output |
| **S3 bucket** (artifacts) | Final MP4 in `hanuman-artifacts` (MinIO locally, S3 in prod) |
| **IAM role** `remotion-lambda-role` | Lambda execution role (Remotion-required name) |
| **IAM user** | Deploy/invoke credentials for render-service |
| **CloudWatch** | Lambda logs (auto-created on deploy) |

## Deploy

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1

chmod +x infrastructure/remotion-lambda/deploy.sh
./infrastructure/remotion-lambda/deploy.sh
```

Or manually:

```bash
cd packages/remotion-renderer
pnpm lambda:policies    # generate IAM JSON
pnpm lambda:deploy      # deploy function + site
```

## Environment variables (production)

```env
RENDER_ENGINE=remotion-lambda
RENDER_SERVICE_URL=http://render-service:8081

# AWS (Remotion Lambda)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
REMOTION_FUNCTION_NAME=          # from deploy output
REMOTION_SERVE_URL=              # from deploy output
REMOTION_BUCKET_NAME=            # from deploy output
REMOTION_FRAMES_PER_LAMBDA=120   # tune for video length

# Artifacts (same as existing S3_* for hanuman-artifacts)
S3_BUCKET=hanuman-artifacts
```

## Performance tuning (5–60+ minute videos)

**Critical:** Never use a fixed low `concurrency` (e.g. 4). It assigns huge frame ranges per Lambda and causes 120s timeouts on 5–10 min videos. HANUMAN always uses `framesPerLambda` computed from duration + account quota.

| Duration | fps | frames | ~frame Lambdas (quota 1000) | Est. render wall time |
|----------|-----|--------|----------------------------|------------------------|
| 5 min | 30 | 9,000 | ~75 | 2–4 min |
| 10 min | 30 | 18,000 | ~120 | 3–6 min |
| 30 min | 30 | 54,000 | ~150 | 5–10 min |
| 60 min | 30 | 108,000 | ~180 | 8–15 min |

With **new AWS accounts** (`REMOTION_ACCOUNT_CONCURRENCY_LIMIT=10`), renders use 9 parallel frame Lambdas max — ~3–5 min for 10 min video, ~8–15 min for 60 min.

**Concurrency quota:** Request increase to **500–1000** for full speed:

```bash
pnpm --filter @hanuman/remotion-renderer lambda:quotas
# or: npx remotion lambda quotas increase
```

After approval, set `REMOTION_ACCOUNT_CONCURRENCY_LIMIT=1000` in ECS.

## Lambda memory / timeout

Production defaults (configurable via env):

- Memory: **3008 MB** (more CPU → faster chunks)
- Timeout: **900 s** per chunk (AWS Lambda max)
- `concurrencyPerLambda`: **2** (2 browser tabs per chunk; stills-validated)
- Disk: 2048 MB
- Planner: `framesPerLambda` from duration + account budget (not fixed `concurrency: 4`)

## Known-good config (validated 2026-07-24)

Do not re-diagnose chunk timeouts from scratch when this config is live — start here.

| Knob | Value | Why |
|------|-------|-----|
| Function (working name) | `remotion-render-4-0-489-mem2048mb-disk2048mb-120sec` | Name is stale; live config is **3008 MB / 900 s**. Do not AWS zip-clone to a new name (Chromium missing). Redeploy only via Remotion `deployFunction`. |
| Site | `hanuman-timeline` on `remotionlambda-useast1-bpvm9ei88s` | |
| `REMOTION_MAX_CONCURRENCY` | **8** | Frame Lambdas; leave 1 orchestrator + 1 spare under account limit 10 |
| `REMOTION_ACCOUNT_CONCURRENCY_LIMIT` | **10** | New-account default until Service Quotas raise |
| `REMOTION_CONCURRENCY_PER_LAMBDA` | **2** | Stills E2E; OffthreadVideo slice used 1 for decode headroom |
| `REMOTION_FUNCTION_MEMORY_MB` / `TIMEOUT_SEC` | **3008** / **900** | |
| Planner target | ~2800 frames/chunk, hard cap 3000 | Avoids old 4×~6500-frame chunks that exceeded 900s |

### Validation runs (same function)

| Run | Media | Frames | fpl × chunks | Max chunk | vs 900s |
|-----|-------|--------|--------------|-----------|---------|
| Indian Fighters local photo fixtures | stills `static:` | 14954 | 1870×8 | **551s** | ~39% headroom |
| Indian Fighters S3 presigned JPGs | stills network | 14954 | 1870×8 | **515s** | ~43% headroom (−36s vs fixtures) |
| WW2 OffthreadVideo clamped slice | **16 MP4s** | 5962 | 1193×5 | **439s** | ~51% headroom |

Artifacts: `packages/remotion-renderer/out/*-validation.json`.

**OffthreadVideo:** ~1.34× slower sec/frame than IF stills on Lambda. IF timelines were stills-only. Raw WW2 slice failed until clip `duration_sec` was clamped to source media length (pipeline had overrun). At account concurrency 10, video-heavy exports longer than ~7–9 min may still need a quota increase.

**Rate Exceeded:** If prior failed renders leave zombies, drain with `put-function-concurrency 0` → wait → `delete-function-concurrency` before retrying.

## Security

- Never expose `AWS_*` or `REMOTION_*` to the browser bundle
- Render-service holds AWS credentials; API/media worker call it over internal network
- Optional `RENDER_SERVICE_API_KEY` for service-to-service auth

See also: `packages/remotion-renderer/docs/IAM.md`
