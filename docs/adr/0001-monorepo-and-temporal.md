# ADR 0001: Monorepo Layout and Temporal for Orchestration

## Status

Accepted

## Date

2026-07-06

## Context

HANUMAN is a greenfield AI video platform requiring a Next.js frontend, FastAPI backend, long-running multi-agent generation pipeline, and FFmpeg rendering. The pipeline runs 30–60 minutes, involves multiple external APIs (LLM, search, TTS, stock footage), and must survive restarts and retries.

We need to choose repository structure and orchestration technology before writing application code.

## Decision

### Monorepo layout

Organize the repository as a monorepo with strict service boundaries:

```
apps/web              Next.js frontend
apps/api              FastAPI HTTP API
workers/orchestrator  Temporal workflows and AI activities
workers/media         FFmpeg render worker
packages/shared-types Domain types (TS + Python)
packages/timeline-schema  Render contract JSON Schema
infrastructure        Docker Compose, deploy sketches
docs                  Architecture and ADRs
```

### Temporal for orchestration

Use Temporal to orchestrate the generation pipeline. Each stage (research, script, voice, scene plan, timeline build, render enqueue) is a Temporal activity. The parent `VideoGenerationWorkflow` coordinates stage order, retries, and timeouts.

### Separate media worker

FFmpeg rendering runs in `workers/media` on a dedicated Temporal task queue (`media`). The orchestrator never invokes FFmpeg directly.

### Workflow ID strategy

Use `video-gen-{project_id}` as the Temporal workflow ID for idempotent starts.

## Rationale

**Monorepo:** Shared types and timeline schema change together with API and workers. A single repo reduces contract drift and simplifies local development with Docker Compose.

**Temporal over cron/queues alone:** Generation runs for tens of minutes across many steps. Temporal provides durable execution, automatic retries, visibility (Temporal UI), and clean separation between workflow logic (deterministic) and side effects (activities). Raw job queues would require building retry, state persistence, and recovery ourselves.

**Separate media worker:** Rendering is CPU-bound and deterministic; AI activities are I/O-bound and non-deterministic. Independent scaling and deployment reduces blast radius when changing LLM providers or FFmpeg settings.

## Consequences

### Positive

- Clear ownership per folder; agents and humans can work in parallel
- Failed stages retry without restarting the entire pipeline
- Temporal UI aids debugging long runs
- Media worker is testable with fixture manifests only

### Negative

- Temporal adds operational complexity (server, workers, versioning)
- Developers must learn workflow vs activity constraints
- Three Python deployables (api, orchestrator, media) instead of one

### Neutral

- Docker Compose required for local Temporal, Postgres, Redis, MinIO
- Workflow code changes require worker redeployment and compatibility awareness

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Celery / RQ job chain | No built-in durable workflow state; harder to model 30+ min multi-step runs |
| Single Python service | Mixes HTTP latency concerns with long-running work; poor separation |
| Step Functions | Vendor lock-in; team target stack is self-hosted Docker Compose first |
| In-process async in API | Does not survive API restarts; poor fit for 60-minute jobs |

## Related

- [../architecture/overview.md](../architecture/overview.md)
- [0002-quote-approval-gate.md](./0002-quote-approval-gate.md)
- [0003-mvp-scope.md](./0003-mvp-scope.md)
