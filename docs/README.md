# Skyclip documentation

Skyclip is an AI-assisted video-generation and editing platform. Some historical architecture decision records and application metadata use the former internal name HANUMAN; those identifiers have not been globally renamed.

## Start here

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Current source-derived service architecture and workflow diagrams |
| [RENDERING_ENGINE.md](./RENDERING_ENGINE.md) | Custom timeline/graphics engine, FFmpeg boundary and export pipeline |
| [OPEN_SOURCE_AUDIT.md](./OPEN_SOURCE_AUDIT.md) | Repository audit, severity-ranked findings and remediation priorities |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Static security findings and hardening recommendations |
| [BENCHMARKS.md](./BENCHMARKS.md) | Reproducible benchmark plan and measurement requirements |
| [ROADMAP.md](./ROADMAP.md) | Contributor-sized engineering roadmap |
| [CODEX_FOR_OSS_APPLICATION.md](./CODEX_FOR_OSS_APPLICATION.md) | Evidence-based application draft with confirmation gaps |

## Architecture references

| Document | Description |
|---|---|
| [architecture/overview.md](./architecture/overview.md) | System boundaries and service data flow |
| [architecture/data-model.md](./architecture/data-model.md) | Entities, state machine and artifact types |
| [architecture/pipeline-stages.md](./architecture/pipeline-stages.md) | Generation stages, inputs/outputs and timeouts |
| [architecture/timeline-manifest.md](./architecture/timeline-manifest.md) | Timeline contract between orchestration and media worker |
| [architecture/progress-events.md](./architecture/progress-events.md) | Event envelope for UI progress |
| [adr/0001-monorepo-and-temporal.md](./adr/0001-monorepo-and-temporal.md) | Monorepo and Temporal decision |
| [adr/0002-quote-approval-gate.md](./adr/0002-quote-approval-gate.md) | Quote approval before expensive generation |
| [adr/0003-mvp-scope.md](./adr/0003-mvp-scope.md) | Historical MVP scope |
| [adr/0012-native-video-engine.md](./adr/0012-native-video-engine.md) | Owned preview/cloud export engine and scene-aware editing |

## Runbooks

| Document | Description |
|---|---|
| [runbooks/local-dev.md](./runbooks/local-dev.md) | Local development setup |
| [../infrastructure/README.md](../infrastructure/README.md) | Docker Compose services and local stack |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contributor workflow and tests |
| [../SECURITY.md](../SECURITY.md) | Vulnerability reporting policy (private channel still needs setup) |

## Reading order for new contributors

1. [../README.md](../README.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [RENDERING_ENGINE.md](./RENDERING_ENGINE.md)
4. [adr/0012-native-video-engine.md](./adr/0012-native-video-engine.md)
5. [runbooks/local-dev.md](./runbooks/local-dev.md)
6. [CONTRIBUTING.md](../CONTRIBUTING.md)

## Scope and limitations

- The architecture and renderer documents distinguish implemented code from planned work.
- The custom engine owns time evaluation and graphics composition; FFmpeg remains responsible for core media processing and encoding.
- GPU/zero-copy rendering, full template parity and performance comparisons are not claimed.
- A repository-level licence has not been selected. See [OPEN_SOURCE_AUDIT.md](./OPEN_SOURCE_AUDIT.md).
