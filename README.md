# HANUMAN

Modular AI video generation platform. Users create projects from a prompt or script, approve a quote, and an async pipeline produces a 1080p MP4.

## Monorepo layout

```
apps/web              Next.js frontend
apps/api              FastAPI backend
workers/orchestrator  Temporal workflows
workers/media         Native media and audio pipeline
render-service        Cloud job API, graphics rasterization, encoding
packages/video-engine Deterministic scene graphics and browser media timing
packages/shared-types Cross-language domain types
packages/timeline-schema  Timeline manifest JSON Schema
infrastructure        Docker Compose and scripts
docs                  Architecture and ADRs
```

## Prerequisites

- Docker Desktop (Compose v2)
- Node.js 20+ and [pnpm](https://pnpm.io/)
- Python 3.12+ and [uv](https://github.com/astral-sh/uv)
- FFmpeg (for media worker; included in Docker image)

## Quick start

### Option A — Full stack in Docker

```bash
cp .env.example .env
make up-all
```

Starts Postgres, Redis, MinIO, Temporal, API, workers, and web. See [infrastructure/README.md](./infrastructure/README.md).

### Option B — Infrastructure in Docker, apps on host (hot reload)

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Install dependencies
make install

# 3. Start infrastructure (Postgres, Redis, MinIO, Temporal)
make up
make init-minio

# 4. Run database migrations
make migrate

# 5. Start application services (separate terminals)
make api
make orchestrator
make media
make web
```

## Verification

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API health | http://localhost:8000/health |
| API readiness | http://localhost:8000/health/ready |
| Temporal UI | http://localhost:8080 |
| MinIO console | http://localhost:9001 |

## Documentation

See [docs/README.md](./docs/README.md) for architecture, ADRs, and runbooks.

## Status

The MVP vertical slice is implemented end-to-end:

- Project creation (prompt-first or script-first)
- Quote generation + approval gate
- Async generation pipeline (Temporal) with live progress (SSE)
- 1080p H.264 MP4 render (FFmpeg) and download
- Owned preview/export engine with premium captions, animated graphic objects,
  original footage audio, native transitions, cancellation, and section caching

See [native engine architecture](docs/adr/0012-native-video-engine.md) for the
runtime, verification commands, deployment requirements, and current limits.

Not yet fully migrated: Postgres pipeline domain → Mongo (ADR 0011 Phase 2); API JWT bridge from Better Auth session; credit metering enforcement.
