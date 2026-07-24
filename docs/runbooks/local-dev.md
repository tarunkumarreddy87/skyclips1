# Local Development Runbook

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Node.js 20+ and pnpm
- Python 3.12+ and [uv](https://github.com/astral-sh/uv)
- FFmpeg installed on host (required once media worker is scaffolded)

## Services (Docker Compose)

Once `infrastructure/docker-compose.yml` is scaffolded, local dependencies will include:

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Application database |
| Redis | 6379 | Cache, progress pub-sub |
| MinIO | 9000 (API), 9001 (console) | S3-compatible storage |
| Temporal | 7233 (gRPC), 8080 (UI) | Workflow orchestration |

## Environment variables

Copy `.env.example` to `.env` at repo root when available. Expected variables:

```bash
# Database
DATABASE_URL=postgresql://hanuman:hanuman@localhost:5432/hanuman

# Redis
REDIS_URL=redis://localhost:6379/0

# S3 (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=hanuman-artifacts
S3_REGION=us-east-1

# Temporal
TEMPORAL_HOST=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE_ORCHESTRATOR=orchestrator
TEMPORAL_TASK_QUEUE_MEDIA=media

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000

# LLM (OpenRouter) — use openrouter/free for MVP
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Stock footage
PEXELS_API_KEY=

# TTS (Sarvam.ai)
SARVAM_API_KEY=
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=shubh
SARVAM_TTS_LANGUAGE=en-IN
SARVAM_TTS_OUTPUT_CODEC=wav
SARVAM_TTS_SAMPLE_RATE=22050
```

Never commit `.env`. Use `.env.example` with empty placeholders only.

## Startup sequence (once scaffolded)

```bash
# 1. Start infrastructure
make up          # or: docker compose -f infrastructure/docker-compose.yml up -d

# 2. Run database migrations
make migrate     # or: cd apps/api && uv run alembic upgrade head

# 3. Start application services (separate terminals or compose profiles)
make api         # FastAPI on :8000
make orchestrator
make media
make web         # Next.js on :3000
```

## Verification checklist

| Check | Command / URL |
|-------|---------------|
| Postgres | `psql $DATABASE_URL -c 'SELECT 1'` |
| Redis | `redis-cli ping` → `PONG` |
| MinIO | http://localhost:9001 (minioadmin/minioadmin) |
| Temporal UI | http://localhost:8080 |
| API health | http://localhost:8000/health |
| Web | http://localhost:3000 |

## Common issues

### Temporal worker not connecting

- Confirm `TEMPORAL_HOST=localhost:7233`
- Ensure Temporal container is healthy: `docker compose ps`
- Check worker logs for namespace mismatch

### MinIO bucket missing

Run init script once: `infrastructure/scripts/init-minio.sh` (after scaffold). Bucket name must match `S3_BUCKET`.

### CORS errors from web

Ensure `CORS_ORIGINS` includes `http://localhost:3000` and API was restarted after env change.

### FFmpeg not found (media worker)

Install FFmpeg on the host or ensure the media worker Docker image includes it. Verify: `ffmpeg -version`.

## Development modes

| Mode | Purpose |
|------|---------|
| **Stub mode** | Activities return fixtures; no external API keys needed |
| **Live mode** | Real LLM/TTS/stock calls; requires API keys in `.env` |

Set `HANUMAN_STUB_MODE=true` in `.env` for local development without API spend (once implemented).

## Port reference

| Service | Port |
|---------|------|
| web | 3000 |
| api | 8000 |
| postgres | 5432 |
| redis | 6379 |
| minio API | 9000 |
| minio console | 9001 |
| temporal gRPC | 7233 |
| temporal UI | 8080 |

## Related

- [../architecture/overview.md](../architecture/overview.md)
- [../README.md](../README.md)
