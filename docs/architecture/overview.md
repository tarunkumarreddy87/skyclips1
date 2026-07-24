# Architecture Overview

## Purpose

HANUMAN is a quote-gated video factory. Users submit a brief (prompt or script), review a structured quote statement, approve it, and an async pipeline produces a finished MP4. The system is designed for modularity: AI orchestration and deterministic rendering are separate deployable units connected by versioned contracts.

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js)                                             │
│  Project creation · Quote review · Progress · Asset preview     │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST + SSE
┌────────────────────────────▼────────────────────────────────────┐
│  apps/api (FastAPI)                                             │
│  Auth · Projects · Quotes · Workflow triggers · Progress fan-out│
└────────────────────────────┬────────────────────────────────────┘
                             │ start workflow · read/write state
┌────────────────────────────▼────────────────────────────────────┐
│  workers/orchestrator (Temporal)                                │
│  research → script → voice → scene plan → timeline → render job │
└──────────────┬─────────────────────────────┬────────────────────┘
               │ activities                  │ enqueue render
┌──────────────▼──────────────┐  ┌─────────▼──────────────────────┐
│  External services          │  │  workers/media (FFmpeg)        │
│  LLM · search · TTS · stock │  │  Manifest → 1080p MP4          │
└─────────────────────────────┘  └────────────────────────────────┘

PostgreSQL (source of truth)  ·  Redis (cache / pub-sub)  ·  S3 (artifacts)
```

## Service responsibilities

### apps/web

- Prompt-first and script-first project creation forms
- Quote statement review and approval UI
- Generation progress display (SSE consumer)
- Artifact preview and final video download

**Must not:** call Temporal directly, run FFmpeg, or store secrets.

### apps/api

- HTTP API for all frontend operations
- PostgreSQL persistence (projects, quotes, runs, artifact metadata)
- Workflow trigger on quote approval
- Progress event persistence and SSE fan-out
- S3 presigned URLs for uploads and downloads

**Must not:** execute LLM calls, TTS, or FFmpeg inline in request handlers.

### workers/orchestrator

- Temporal worker hosting `VideoGenerationWorkflow`
- Activities for each pipeline stage (research, script, voice, scene plan, timeline build, render enqueue)
- Writes intermediate artifacts to S3 and metadata to PostgreSQL
- Emits structured progress events

**Must not:** call FFmpeg. Rendering is delegated to the media worker.

### workers/media

- Consumes render jobs from Temporal `media` task queue
- Reads timeline manifest from S3
- Runs FFmpeg pipeline to produce `final.mp4`
- Uploads output to S3 and signals completion

**Must not:** call LLMs or make non-deterministic decisions. Input is the manifest only.

## Shared packages

| Package | Role |
|---------|------|
| `packages/shared-types` | Domain types (project, quote, progress) shared across TypeScript and Python |
| `packages/timeline-schema` | JSON Schema v1 for the orchestrator → media worker contract |

JSON Schema in `timeline-schema` is the source of truth for the render contract. Domain types should stay aligned via CI validation.

## Data stores

| Store | Usage |
|-------|-------|
| **PostgreSQL** | Users, projects, quotes, generation runs, artifact pointers, workflow correlation IDs |
| **Redis** | Progress pub-sub, short-lived caches, optional rate limiting |
| **S3-compatible** | Scripts, research, audio, scene assets, timeline manifests, final exports |

## Core invariants

1. **Quote before generate** — No expensive activity runs until the user approves the quote.
2. **Manifest as render boundary** — The media worker accepts only a validated `timeline.v1.json`.
3. **Progress as projection** — UI reads progress from the API, not from Temporal queries.
4. **Idempotent workflow starts** — Workflow ID is `video-gen-{project_id}` to prevent duplicate runs.
5. **Artifacts are immutable** — Each stage writes a new versioned object; downstream stages reference by key.

## Entry paths

Both entry paths converge on the same workflow after quote approval.

| Path | Upstream difference | Pipeline after approval |
|------|---------------------|-------------------------|
| **Prompt-first** | Brief is a topic/description; script is generated | Full pipeline |
| **Script-first** | Brief includes supplied script; `GenerateScript` is skipped | `ParseScript` → voice → scenes → timeline → render |

## Format modes

Documentary and listicle are **strategy variants** within the same workflow:

- Different quote inference rules and section templates
- Different LLM prompts for script and scene planning
- Same timeline schema and render pipeline

## Local development stack

Docker Compose provides Postgres, Redis, MinIO (S3), and Temporal. Application services run on the host or in Compose once scaffolded. See [../runbooks/local-dev.md](../runbooks/local-dev.md).

## Related documents

- [data-model.md](./data-model.md)
- [pipeline-stages.md](./pipeline-stages.md)
- [timeline-manifest.md](./timeline-manifest.md)
- [progress-events.md](./progress-events.md)
- [../adr/0001-monorepo-and-temporal.md](../adr/0001-monorepo-and-temporal.md)
