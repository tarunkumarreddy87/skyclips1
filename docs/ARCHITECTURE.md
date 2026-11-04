# Skyclip system architecture

**Status:** Source-derived overview; static inspection only.

## System overview

```mermaid
flowchart LR
  U[User / browser] --> WEB[Next.js web app]
  WEB --> API[FastAPI API]
  API --> DB[(PostgreSQL)]
  API --> REDIS[(Redis)]
  API --> OBJ[(S3-compatible object storage)]
  API --> ORCH[Temporal workflow]
  ORCH --> OW[Python orchestrator worker]
  OW --> API
  OW --> MEDIA[Python media worker]
  MEDIA --> RS[Node render service]
  RS --> VE[TypeScript video engine]
  RS --> PY[Native Python render pipeline]
  PY --> FFMPEG[FFmpeg / ffprobe]
  PY --> OBJ
  API --> OBJ
  RS --> REDIS
  WEB --> PREVIEW[Native timeline preview]
  PREVIEW --> VE
```

The repository includes code for these services and local Compose definitions. This diagram describes the observed architecture, not a claim that every service is always enabled or deployed identically in production.

## Core services

| Component | Source directory | Responsibility |
|---|---|---|
| Frontend | `apps/web` | Next.js application and editor UI |
| API | `apps/api` | FastAPI routes, authentication, projects, timelines and render coordination |
| Workflow worker | `workers/orchestrator` | Temporal worker and generation activities |
| Media worker | `workers/media` | Asset staging, media rendering, audio processing and export |
| Render service | `render-service` | Native render HTTP API, render job store and worker lifecycle |
| Video engine | `packages/video-engine` | Shared deterministic timing, SVG graphics, captions, templates and scene evaluation |
| Shared domain | `packages/shared-types`, `packages/timeline-schema` | Type and manifest contracts |
| Local infrastructure | `infrastructure/docker-compose.yml` | Postgres, Redis, MinIO, Temporal and application services |

## Video-generation workflow

```mermaid
flowchart TD
  A[Create project and brief] --> B[Generate / edit quote]
  B --> C{User approval}
  C -->|Approved| D[Temporal generation run]
  D --> E[Research and script activities]
  E --> F[Media and scene planning]
  F --> G[Assets, narration and timeline]
  G --> H[Persist timeline manifest]
  H --> I[Render job submission]
  I --> J[Native media pipeline]
  J --> K[MP4 artifact in object storage]
  K --> L[Progress and download]
```

The detailed activities are implemented across `apps/api/app/services`, `workers/orchestrator/src/activities`, `workers/orchestrator/src/workflows`, and `workers/media/src`. Provider availability and configured feature flags can affect individual generation activities.

## Rendering pipeline

See [RENDERING_ENGINE.md](./RENDERING_ENGINE.md). At a high level:

```mermaid
flowchart TD
  A[Timeline manifest] --> B[Validate manifest]
  B --> C[Stage source assets]
  C --> D[Pre-render supported HTML / 3D clips]
  D --> E[Split timeline into sections]
  E --> F[Shared SVG graphics at frame timestamps]
  F --> G[Resvg raw RGBA]
  G --> H[FFmpeg video composition and section encode]
  E --> I[FFmpeg audio mix]
  H --> J[Concatenate sections]
  I --> J
  J --> K[Final MP4 and object upload]
```

## Job lifecycle

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> starting
  starting --> rendering
  rendering --> copying
  copying --> completed
  starting --> failed
  rendering --> failed
  copying --> failed
  queued --> cancelled
  starting --> cancelled
  rendering --> cancelled
  failed --> [*]
  completed --> [*]
  cancelled --> [*]
```

The render worker persists job records when Redis is configured, uses leases and heartbeats to protect ownership, retries within configured limits, and can recover active jobs after process restart. The precise state transitions also depend on the store implementation; see `render-service/src/jobs/job-store.ts` and `render-worker.ts`.

## Data and infrastructure

- PostgreSQL stores API domain entities through SQLAlchemy models and Alembic migrations.
- Redis supports render-service job persistence and shared capacity coordination when configured; the API also uses Redis.
- S3-compatible storage stores source media and render artifacts.
- Temporal coordinates asynchronous generation activities.
- Local development uses MinIO as the S3-compatible service.

The README notes that some product/platform migrations and auth/credit integrations are incomplete. Do not interpret the presence of a config variable or ADR as proof that a planned migration is finished.

## Error handling and observability

- API routes translate service errors to HTTP responses and use liveness/readiness endpoints.
- Render jobs expose progress and terminal state; worker logs use structured logging.
- Render workers bound retries and runtime, support cancellation and verify output frame counts for some paths.
- Temporal activity and workflow retries are configured separately from render worker retries.
- Operational alerting, production SLOs and end-to-end trace coverage need deployment-level validation.

## Key implementation references

- `apps/api/app/main.py`, `apps/api/app/api/router.py`
- `apps/api/app/services/generation_service.py`, `render_service.py`
- `workers/orchestrator/src/workflows/video_generation.py`
- `workers/media/src/render/native_pipeline.py`
- `render-service/src/api/routes.ts`, `render-service/src/jobs/render-worker.ts`
- `packages/video-engine/src/index.ts`
