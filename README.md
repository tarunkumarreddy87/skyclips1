# Skyclip

Skyclip is an AI-assisted video-generation and editing platform built around editable timeline manifests and an asynchronous generation/render pipeline.

The repository contains a Next.js editor, FastAPI backend, Temporal orchestration workers, Python media pipeline, a Node render service, and a shared TypeScript video engine. The rendering implementation is custom for timeline evaluation, graphics, captions, templates and motion scenes; it uses FFmpeg for media processing and encoding rather than reimplementing video codecs.

> **Project status:** Active development / experimental. The repository contains an end-to-end generation and export path, but authentication/platform migration, billing enforcement, some template capabilities, production security hardening and contributor automation remain incomplete. See [known limitations](#known-limitations).

> **License:** This repository includes the Apache License, Version 2.0 (`LICENSE`). Review that license and the notices for third-party dependencies, fonts, media, and other bundled assets before redistribution. The presence of a project license does not relicense third-party materials.

## What is in the repository

| Path | Purpose |
|---|---|
| **apps/web** | Next.js frontend and video editor |
| **apps/api** | FastAPI routes, projects, users, timelines and render coordination |
| **workers/orchestrator** | Temporal workflows and AI/media planning activities |
| **workers/media** | Python media pipeline, audio handling, FFmpeg integration and export |
| **render-service** | Node render API, job lifecycle and native scene rasterization/capture |
| **packages/video-engine** | Deterministic timeline, graphics, text, templates, animation and audio-cue logic |
| **packages/shared-types** | Shared TypeScript/Python contracts |
| **packages/timeline-schema** | Timeline manifest schema |
| **infrastructure** | Docker Compose and deployment configuration |
| **docs** | Architecture decision records, runbooks and engineering documentation |

## Current capabilities

The source tree currently includes:

- Prompt/script-based project creation and a quote/approval workflow.
- Asynchronous generation activities coordinated by Temporal.
- Timeline manifests, snapshots, progress events and editor operations.
- Deterministic time-based graphics, captions, documentary templates and declarative motion-scene composition.
- Native media composition with footage, b-roll, transitions, narration, music, SFX and original footage audio.
- Render job status, progress, cancellation, retries, cache integration and object-storage artifact publication.
- CPU H.264 encoding, with optional NVENC when the worker's actual capability probe succeeds.

These describe code paths found in the repository, not a promise that every external provider, production environment, template type or deployment mode is configured and working out of the box.

## Rendering engine

Skyclip's custom engine is not a replacement for FFmpeg.

**Skyclip-owned logic** includes absolute-time timeline evaluation, animation/keyframe interpolation, SVG graphics and caption composition, text layout, documentary templates, declarative scene rendering and audio-cue planning. The browser preview and export share graphics-generation logic.

**External media tooling** includes FFmpeg/ffprobe for decoding, filters, transitions, audio mixing, section encoding, final muxing and media inspection; Resvg for SVG rasterization; and Chromium/Playwright for supported HTML/GSAP and Three.js capture paths.

GPU encoding does not mean end-to-end GPU composition. Much of the rasterization, filtering and audio work remains CPU-based.

See [docs/RENDERING_ENGINE.md](docs/RENDERING_ENGINE.md) and [ADR 0012](docs/adr/0012-native-video-engine.md).

## Architecture

~~~mermaid
flowchart LR
  U[Browser] --> WEB[Next.js editor]
  WEB --> API[FastAPI]
  API --> DB[(PostgreSQL)]
  API --> OBJ[(S3 / MinIO)]
  API --> T[Temporal]
  T --> O[Orchestrator worker]
  O --> M[Media worker]
  M --> R[Render service]
  R --> V[Shared video engine]
  R --> F[FFmpeg pipeline]
  F --> OBJ
  WEB --> V
~~~

The diagram is a source-derived overview. Redis, object storage, PostgreSQL and Temporal are configured differently between local and deployed environments. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for service boundaries, workflows, job states and source references.

## Technology stack

- **Frontend:** Next.js, React, TypeScript
- **API:** Python 3.12, FastAPI, SQLAlchemy, Alembic
- **Orchestration:** Temporal Python SDK
- **Render service:** Node.js, TypeScript, Fastify, Playwright
- **Video engine:** TypeScript, SVG, Three.js, Resvg
- **Media:** FFmpeg, ffprobe, Python
- **Infrastructure:** Docker Compose, PostgreSQL, Redis, MinIO/S3-compatible storage

Exact dependencies are defined by the workspace package manifests and Python project/lock files.

## Prerequisites

For the documented local stack:

- Docker Desktop or Docker Engine with Docker Compose v2
- Node.js 20+ and pnpm 9.15
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- FFmpeg/ffprobe for host-run media tests and exports (the Docker media images install them)

## Installation and local development

### Full stack with Docker Compose

The web image requires non-empty Supabase URL and public/anon key values at build time. A real Supabase project is required for working authentication; placeholders allow local image configuration but do not provide a functioning login.

~~~bash
cp .env.example .env
# Edit the Supabase placeholders if you need to test authentication.
make up-all
~~~

The root environment template enables stub/offline mode for local development. Do not use its development settings in production.

Services are available at:

| Service | URL |
|---|---|
| Web editor | http://localhost:3000 |
| API | http://localhost:8000 |
| API health | http://localhost:8000/health |
| API readiness | http://localhost:8000/health/ready |
| Temporal UI | http://localhost:8080 |
| MinIO console | http://localhost:9001 |

Useful commands:

~~~bash
make ps
make logs
make down
~~~

See [infrastructure/README.md](infrastructure/README.md) and [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md).

### Run application processes on the host

~~~bash
cp .env.example .env
make install
make up
make migrate
~~~

Then run each process in its own terminal:

~~~bash
make api
make orchestrator
make media
make web
~~~

The render service is started separately when working directly on it:

~~~bash
cd render-service
pnpm dev
~~~

For host-run processes, the Makefile sets the Temporal host to localhost. Check each service's README and configuration module for additional provider-specific environment variables.

## Environment configuration

- Root **.env.example**: local Compose and shared service variables.
- **apps/web/.env.example**: web authentication, MongoDB and payment-provider variables.
- **infrastructure/aws/production.env.example**: deployment-oriented environment reference.

Never commit .env files, production credentials, private media or real API keys. Keep development and production credentials separate.

## Test and build

The repository has tests across the video engine, render service, API, orchestrator and media worker. The following are package-level commands, not a claim that the full matrix currently passes:

~~~bash
# Node workspace
pnpm install --frozen-lockfile
pnpm --filter @hanuman/video-engine typecheck
pnpm --filter @hanuman/video-engine test
pnpm --filter @hanuman/render-service typecheck
pnpm --filter @hanuman/render-service build
pnpm --filter @hanuman/render-service test
pnpm --filter @hanuman/web typecheck

# Python API
(cd apps/api && uv sync --locked --extra dev && uv run pytest)

# Temporal orchestrator
(cd workers/orchestrator && uv sync --locked --group dev && uv run pytest)

# Media worker (FFmpeg/ffprobe required for export tests)
(cd workers/media && uv sync --locked --extra dev && uv run pytest)
~~~

Some export/template tests require FFmpeg, ffprobe, browser binaries or local runtime dependencies; inspect skip reasons and test output. No complete test coverage percentage is asserted.

The GitHub Actions workflow runs the package checks, Python test suites, Compose configuration validation, dependency audits and secret scanning on pushes and pull requests. Workflow status must be checked on the relevant commit; a workflow definition alone does not mean checks have passed.

## API documentation

When the API is running, FastAPI's generated OpenAPI interface is available at:

- Swagger UI: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json

The API route modules are under apps/api/app/api/routes/. The render-service HTTP contract is documented in [render-service/README.md](render-service/README.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/RENDERING_ENGINE.md](docs/RENDERING_ENGINE.md). Issues and pull requests should include reproducible steps and exact test commands/results. Rendering changes should include deterministic fixtures and output validation.

## Security

See [SECURITY.md](SECURITY.md) and [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md). Do not submit secrets or exploitable details in public issues. The private vulnerability reporting channel needs maintainer configuration before public launch.

## Licence

**Not yet selected.** A public GitHub repository without a licence does not grant the usual open-source permissions. The maintainer must select and confirm a licence after reviewing dependency, font, media and other third-party rights. Do not add or infer a licence from package dependencies.

## Known limitations

- Authentication and platform migration are not fully reconciled across all services; stub mode is for development only.
- Credit metering enforcement is not complete.
- The generic SVG scene renderer does not execute arbitrary uploaded HTML/CSS/JavaScript templates; HTML/GSAP and Three.js have distinct rendering paths and capability limits.
- External media URL ingestion needs SSRF-safe destination controls before accepting untrusted URLs in production.
- Render-service API authentication must be required in deployed environments; an unset key currently disables its API-key check.
- Graphics rasterization and significant media composition work are CPU-based; NVENC, when available, accelerates encoding only.
- No independently reproduced render-speed comparison against commercial editors is published.
- The repository has no selected licence at this point.

See [docs/OPEN_SOURCE_AUDIT.md](docs/OPEN_SOURCE_AUDIT.md), [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/BENCHMARKS.md](docs/BENCHMARKS.md).

## Project status and roadmap

This codebase is in active development. Capabilities and completeness vary across local, test and cloud configurations. The roadmap prioritizes service security, reproducible CI, developer onboarding, render reliability and benchmark evidence.
