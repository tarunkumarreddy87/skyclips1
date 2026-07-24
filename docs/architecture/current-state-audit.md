# Current State Audit

**Date:** 2026-07-07  
**Scope:** Factual inventory of the HANUMAN monorepo as implemented today.  
**Method:** Code and config inspection; no idealized architecture.

---

## Executive summary

HANUMAN is a **functional MVP monorepo** with an end-to-end vertical slice proven (prompt-first documentary → quote → generation → 1080p MP4 download). Phases 0–6 are largely complete. The repo exceeds a skeleton: it contains real Temporal workflows, external API integrations (OpenRouter, Pexels, Sarvam), FFmpeg rendering, and a minimal web UI.

**Maturity:** Early production-capable locally; not production-hardened (auth, CI, observability, contract enforcement gaps).

---

## apps/web

**Stack:** Next.js 15 App Router, TypeScript, `@hanuman/shared-types`.

| Route | File | Rendering | Status |
|-------|------|-----------|--------|
| `/` | `apps/web/src/app/page.tsx` | Server (`force-dynamic`) | Health + readiness display |
| `/projects` | `apps/web/src/app/projects/page.tsx` | Server | Project list |
| `/projects/new` | `apps/web/src/app/projects/new/page.tsx` | Client | Create project form |
| `/projects/[id]` | `apps/web/src/app/projects/[id]/page.tsx` | Hybrid | Server fetch + client quote/generation UI |

**Components:**
- `QuoteReview.tsx` — quote generate/edit/approve; auto-starts generation on approve
- `GenerationPanel.tsx` — SSE progress stepper, retry, video download link

**API client** (`apps/web/src/lib/api-client.ts`):
- Browser requests use same-origin `/api/*` proxy (`next.config.ts` rewrites to FastAPI)
- Server components call `NEXT_PUBLIC_API_URL` directly
- SSE via `EventSource` on `/projects/{id}/progress`
- Friendly errors for 503 (DB down) and network failures

**Not implemented in web:**
- Auth UI (Clerk/Auth0)
- S3 presigned script upload (file picker reads `.txt`/`.md` into `scriptText` only)
- Asset preview beyond final video download
- Historical progress REST fallback on reconnect
- `X-User-External-Id` header

---

## apps/api

**Stack:** FastAPI, SQLAlchemy async, Alembic, Temporal client, boto3 (MinIO).

### Endpoints (16 + root)

| Area | Paths | Status |
|------|-------|--------|
| Health | `GET /health`, `GET /health/ready` | Implemented |
| Projects | `POST/GET /projects`, `GET /projects/{id}` | Implemented |
| Upload | `POST /projects/{id}/upload-url` | Implemented; **not used by web** |
| Quotes | `POST/PATCH/GET /projects/{id}/quote`, `POST .../approve` | Implemented |
| Generation | `POST .../generate`, `GET .../runs/latest`, `GET .../video` | Implemented |
| Progress | `GET .../progress` (SSE), `GET .../progress/events` | Implemented |
| Internal | `POST /internal/progress-events`, `/artifacts`, `/runs/{id}/status` | Implemented |

### Data layer

**Models** (`apps/api/app/db/models/`): `User`, `Project`, `Brief`, `Quote`, `GenerationRun`, `Artifact`, `ProgressEvent`.

**Migrations:**
- `0001_initial.py` — empty stub
- `0002_core_schema.py` — full schema + dev user seed (`dev-local-user`)

### Services

| Service | Responsibility |
|---------|----------------|
| `ProjectService` | CRUD, brief embedding |
| `QuoteService` | Quote lifecycle, state guards (409 on invalid transitions) |
| `quote_inference` | **Rule-based** quote generation (no LLM in API) |
| `GenerationService` | Run creation, Temporal workflow start, approval gate |
| `TemporalService` | Real `temporalio` client, starts `VideoGenerationWorkflow` |
| `ProgressService` | Ingest + SSE (DB poll every 1s) |
| `StorageService` | S3 presigned URLs, `upload_bytes` |
| `InternalService` | Worker callbacks |

### Auth

- `get_current_user` — MVP stub: `X-User-External-Id` header or `dev-local-user`
- `verify_internal_key` — `X-Internal-Key` for worker routes
- No JWT/OAuth/Clerk/Auth0

### Tests (`apps/api/tests/`)

| File | Coverage |
|------|----------|
| `test_projects.py` | Create, list, get, script-first, validation |
| `test_quotes.py` | Quote lifecycle, 409 guards |
| `test_generation.py` | Approval gate, mocked Temporal, internal auth |
| `test_quote_inference.py` | Unit tests for heuristics |
| `test_mvp_paths.py` | Script-first + listicle quote paths |

Integration tests require live Postgres; skip if DB unavailable.

### Config

Loads from repo root `.env`. Worker-only keys (`OPENROUTER_*`, `PEXELS_*`, `SARVAM_*`, `HANUMAN_STUB_MODE`) defined in API config but **unused by API code**.

---

## workers/orchestrator

**Stack:** Temporal Python SDK, httpx, boto3, external API clients.

### Workflows (`src/workflows/video_generation.py`)

| Workflow | Registered | Behavior |
|----------|------------|----------|
| `VideoGenerationWorkflow` | Yes | Full 7-stage pipeline → `render_video` on `media` queue |
| `HealthCheckWorkflow` | Yes | Returns `"ok"` |

**Branching:**
- `script_first` → skip `run_research`, use `parse_script`
- `prompt_first` → `run_research` → `generate_script`

### Activities (`src/activities/pipeline.py`)

| Activity | External deps | Stub mode (`HANUMAN_STUB_MODE`) |
|----------|---------------|----------------------------------|
| `validate_brief` | None | N/A |
| `run_research` | OpenRouter | Stub dict |
| `generate_script` | OpenRouter | Hardcoded sections |
| `parse_script` | S3 (optional `script_s3_key`) | N/A |
| `generate_voice` | Sarvam, ffmpeg concat | Silent WAV |
| `plan_scenes` | Pexels | Placeholder PNG |
| `build_timeline` | S3 narration duration | N/A |
| `complete_run` / `fail_run` | API callbacks | N/A |

**Legacy:** `activities/stubs.py` (`stub_ping`) exists but is **not registered**.

### External clients

- `clients/openrouter.py` — `chat_completion`
- `clients/pexels.py` — `search_photos`
- `clients/sarvam.py` — `synthesize_speech_stream`

### API callbacks (`pipeline/api_client.py`)

`POST /internal/progress-events`, `/internal/artifacts`, `/internal/runs/{id}/status` with `X-Internal-Key`.

### Tests

**None** in orchestrator package.

---

## workers/media

**Stack:** Temporal Python SDK, FFmpeg, boto3, jsonschema.

### Render pipeline (`src/render/ffmpeg_pipeline.py`)

- `validate_manifest()` — JSON Schema + duration invariants (loads schema from repo path)
- `render_manifest()` — image loops → H.264 segments → concat → AAC mux
- Output: 1920×1080, 30fps, hard cuts
- All video clips rendered as looped stills (`-loop 1`), even when `type: "video"`

### Activity (`src/activities/render.py`)

`render_video` — render, register `final_video` artifact, emit progress at 85%.

### Tests

`workers/media/tests/test_manifest_validation.py` — 2 pytest cases for schema/duration rejection.

### Config note

`hanuman_stub_mode` defined in media config but **unused** in render path.

---

## packages/shared-types

### TypeScript (`packages/shared-types/src/`)

Exports: `Project`, `Brief`, `ProjectDetail`, `ProjectList`, `Quote`, `ProgressEvent`, enums for status/entry/format.

Used by `apps/web` via workspace dependency.

### Python (`packages/shared-types/python/shared_types/`)

Pydantic models: `Project`, `Quote`, `ProgressEvent`, enums.  
**Missing vs TS:** `Brief`, `ProjectDetail`, `ProjectList`.

Consumed by orchestrator via editable path dependency.

---

## packages/timeline-schema

### Schema

`schema/timeline.v1.json` — Draft-07, version `"1"`, 1920×1080, 30fps, documentary/listicle.

### TypeScript

`src/validate.ts` — Ajv compile, `isValidTimeline`, `formatValidationErrors`.  
`pnpm validate-fixtures` validates `fixtures/documentary-minimal.json`, `listicle-minimal.json`.

### Python package (`packages/timeline-schema/python/`)

`hanuman_timeline_schema/__init__.py` imports `validate.py` which **does not exist** — package not importable.  
Media worker validates inline via jsonschema in `ffmpeg_pipeline.py` instead.

---

## infrastructure

### Docker Compose (`infrastructure/docker-compose.yml`)

**Full stack:** postgres, redis, minio, minio-init, temporal, temporal-ui, migrate, api, orchestrator, media, web.

**Makefile:**
- `make up` — infra only + minio-init
- `make up-all` — full stack build
- `make api|web|orchestrator|media` — host hot-reload dev

### Dockerfiles

Present for api, web, orchestrator, media (repo-root build context).

### Gaps

- No CI workflow wiring found for compose/test runs
- `docs/runbooks/local-dev.md` partially stale (future tense for implemented features)

---

## docs

| Category | Files | Status |
|----------|-------|--------|
| Architecture | `overview.md`, `data-model.md`, `pipeline-stages.md`, `timeline-manifest.md`, `progress-events.md` | Comprehensive target design |
| ADRs | `0001` monorepo+Temporal, `0002` quote gate, `0003` MVP scope | Accepted |
| Runbooks | `local-dev.md` | Partially stale |
| Index | `docs/README.md`, root `README.md`, `infrastructure/README.md` | Current |

**No prior audit/roadmap docs** existed before this pass.

---

## Proven capabilities (runtime evidence)

- Project CRUD + quote approval gate
- Temporal workflow execution with live OpenRouter, Pexels, Sarvam (when `HANUMAN_STUB_MODE=false`)
- Progress SSE to web UI
- FFmpeg render to MinIO + presigned download
- E2E success on prompt-first documentary path (local, Jul 2026)

## Known runtime issues encountered (historical)

- MinIO bucket must exist (`make init-minio`)
- Sarvam WAV merge required ffmpeg (not Python `wave`)
- FFmpeg `capture_output=True` deadlocks on Windows
- Timeline clip durations must use ffprobe (Sarvam WAV parsing)
- Web requires Docker + API running; Next.js `/api` proxy added for CORS

---

## Related documents

- [gap-analysis.md](./gap-analysis.md)
- [implementation-roadmap.md](./implementation-roadmap.md)
