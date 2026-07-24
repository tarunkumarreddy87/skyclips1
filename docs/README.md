# HANUMAN Documentation

HANUMAN is a modular, production-oriented AI video generation platform. Users create projects from a prompt or script, review and approve a quote statement, then an async multi-agent pipeline produces a 1080p 16:9 MP4.

## Document index

### Architecture

| Document | Description |
|----------|-------------|
| [overview.md](./architecture/overview.md) | System boundaries, services, data flow |
| [data-model.md](./architecture/data-model.md) | Entities, state machine, artifact types |
| [pipeline-stages.md](./architecture/pipeline-stages.md) | Generation stages, inputs/outputs, timeouts |
| [timeline-manifest.md](./architecture/timeline-manifest.md) | Render contract between orchestrator and media worker |
| [progress-events.md](./architecture/progress-events.md) | Event envelope for UI progress tracking |

### Architecture Decision Records (ADR)

| ADR | Decision |
|-----|----------|
| [0001-monorepo-and-temporal.md](./adr/0001-monorepo-and-temporal.md) | Monorepo layout and Temporal for orchestration |
| [0002-quote-approval-gate.md](./adr/0002-quote-approval-gate.md) | Quote approval before expensive generation |
| [0003-mvp-scope.md](./adr/0003-mvp-scope.md) | MVP inclusions and explicit exclusions |

### Runbooks

| Runbook | Description |
|---------|-------------|
| [local-dev.md](./runbooks/local-dev.md) | Local development setup (Docker Compose, env vars) |

## Monorepo layout

```
apps/web              Next.js frontend
apps/api              FastAPI backend
workers/orchestrator  Temporal workflows and AI activities
workers/media         FFmpeg render worker
packages/shared-types Cross-language domain types
packages/timeline-schema  Timeline manifest JSON Schema
infrastructure        Docker Compose, deploy sketches
docs                  This documentation
```

## Reading order for new contributors

1. [architecture/overview.md](./architecture/overview.md)
2. [adr/0003-mvp-scope.md](./adr/0003-mvp-scope.md)
3. [architecture/data-model.md](./architecture/data-model.md)
4. [architecture/pipeline-stages.md](./architecture/pipeline-stages.md)
5. [architecture/timeline-manifest.md](./architecture/timeline-manifest.md)
6. [runbooks/local-dev.md](./runbooks/local-dev.md)

## MVP constraints

- Documentary and listicle modes only
- 1080p 16:9 MP4 export only
- No billing, mobile app, advanced motion graphics, or full editor polish

See [adr/0003-mvp-scope.md](./adr/0003-mvp-scope.md) for the full scope definition.
