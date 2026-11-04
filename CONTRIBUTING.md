# Contributing to Skyclip

Thank you for considering a contribution. Skyclip is a multi-runtime monorepo; keep changes focused and document which service/package they affect.

## Before opening a pull request

1. Read [README.md](./README.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), and [docs/RENDERING_ENGINE.md](./docs/RENDERING_ENGINE.md).
2. Check existing issues and pull requests to avoid duplicating work.
3. For substantial changes, open an issue or proposal before changing public contracts, timeline schemas, storage formats, or render behavior.
4. Do not add credentials, customer media, generated MP4s, proprietary datasets, or local environment files.

## Development setup

Requirements currently described by the repository:
- Docker Desktop / Docker Compose v2
- Node.js 20+ and pnpm 9
- Python 3.12+ and uv
- FFmpeg and ffprobe for media-worker tests and local export

The root quick start currently references a missing root `.env.example`. Until that is added, copy the required values from `infrastructure/docker-compose.yml` and the relevant application config; do not use production credentials. The web-specific variables are listed in [apps/web/.env.example](./apps/web/.env.example).

Install Node workspace dependencies:

```bash
pnpm install
```

Install Python service dependencies:

```bash
cd apps/api && uv sync --group dev
cd ../../workers/orchestrator && uv sync --group dev
cd ../media && uv sync --group dev
```

Start services using the repository Makefile only after configuring a local-only environment. See [docs/runbooks/local-dev.md](./docs/runbooks/local-dev.md).

## Tests and checks

Run the narrowest relevant tests first, then the affected package checks.

```bash
# TypeScript video engine
pnpm --filter @hanuman/video-engine test
pnpm --filter @hanuman/video-engine typecheck

# Render service
pnpm --filter @hanuman/render-service test
pnpm --filter @hanuman/render-service typecheck

# Python media worker
cd workers/media && uv run pytest

# API
cd apps/api && uv run pytest
```

The root workspace currently exposes Turbo build/lint/typecheck scripts; package support differs. Do not report a check as passing unless it was executed. Rendering tests may require FFmpeg/ffprobe and Chromium; tests should skip explicitly when a documented system dependency is unavailable.

## Branches and commits

- Branch names: `feat/<short-topic>`, `fix/<short-topic>`, `docs/<short-topic>`, or `test/<short-topic>`.
- Use imperative, scoped commit messages: `feat(renderer): add scene easing`, `fix(api): reject invalid media keys`, `docs: clarify local environment setup`.
- Keep unrelated formatting or generated-file changes out of functional pull requests.

## Pull requests

A pull request should include:
- Problem statement and user-visible/operational impact.
- Why the implementation approach is appropriate.
- Services/packages and contracts affected.
- Tests executed, including exact commands and results.
- Migration, environment, storage, or deployment notes.
- For rendering changes: deterministic fixture, output dimensions/FPS/duration, encoder and visual/audio review evidence.

Do not include invented benchmark figures or screenshots of customer content.

## Code quality

- Follow the existing formatting and naming conventions of the touched package.
- Prefer typed interfaces and schema validation at service boundaries.
- Keep asynchronous work bounded and cancellable.
- Avoid shell interpolation; pass subprocess arguments as arrays.
- Avoid arbitrary network fetches from user-controlled URLs.
- Keep secrets out of source, logs, fixtures and pull-request discussion.
- Add regression tests for bug fixes.

## Issues

Bug reports should include expected and observed behavior, minimal reproduction steps, environment/runtime versions, relevant logs with secrets removed, and whether the issue reproduces on the latest commit.

Feature proposals should describe the use case, acceptance criteria, affected contracts and test strategy.
