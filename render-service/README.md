# Render Service — Remotion Lambda only (ADR 0009)

Dedicated Node.js service for AWS Remotion Lambda cloud rendering. No local Chromium rendering.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/render/start` | Queue Lambda render |
| GET | `/render/:id/status` | Poll progress |
| GET | `/render/:id/result` | Final artifact URL |
| DELETE | `/render/:id` | Cancel render |
| GET | `/health` | Health check |

## Quick start

```bash
# 1. Deploy AWS infrastructure (once)
cd infrastructure/remotion-lambda
./deploy.sh

# 2. Configure .env (see .env.example at repo root)

# 3. Start service
pnpm --filter @hanuman/render-service dev
```

## Environment

See repo `.env.example` — render service reads:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `REMOTION_FUNCTION_NAME`, `REMOTION_SERVE_URL`
- `S3_BUCKET_NAME` (+ MinIO `S3_ENDPOINT` for local artifact storage)

## Architecture

```
Temporal media worker
  → POST render-service /render/start
  → poll GET /render/:id/status
  → GET /render/:id/result
  → register artifact via API /internal/artifacts
```

All rendering uses `@remotion/lambda` with parallel chunk Lambdas tuned via `REMOTION_FRAMES_PER_LAMBDA`.
