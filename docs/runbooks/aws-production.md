# HANUMAN production rendering

Native engine migration: 2026-09-30. Local verification does not deploy changes
to the public AWS application. Existing resource inventory is historical until
an operator verifies the current account state.

## Architecture

```text
Browser → web → API → Temporal → media worker → native render-service
                        ↓                     ↓
                    PostgreSQL             Redis jobs
                                              ↓
                                  SVG/resvg + FFmpeg → S3
```

Cloud rendering streams RGBA overlays into FFmpeg, encodes bounded sections,
mixes absolute-time audio, and uploads the MP4. See
[ADR 0012](../adr/0012-native-video-engine.md) for capabilities and limits.
Removed renderer resources are not automatically deleted from AWS.

## Configuration

Set `RENDER_ENGINE=native-cloud`, `RENDER_SERVICE_URL`, and
`RENDER_SERVICE_API_KEY` on the media worker. Set `NEXT_PUBLIC_PREVIEW_ENGINE=native`
when building web. Render-service requires its Dockerfile's Python/Node/native
libraries, shared asset storage, and `REDIS_URL` for durable jobs.

Use `RENDER_ENCODER=auto` to probe NVENC and fall back to CPU.
Fargate deployments remain CPU deployments; NVIDIA acceleration requires a
GPU-capable worker host and container runtime. Tune section concurrency, FFmpeg
threads, scratch capacity, job capacity and cache using measured workloads.
Local cache hits do not represent cold cloud-render speed.

Use task IAM roles for S3 in AWS, preserving the existing artifacts bucket and
project keys. Keep render-service internal and authenticate its endpoints.
Use persistent Redis with appropriate eviction/persistence settings rather than
the development stack's disposable Redis container.

## Deployment and checks

Build the five application images with the project's Compose configuration, or
use `infrastructure/aws/deploy-ecs.ps1` for the existing AWS deployment workflow.
Database/Temporal/S3 data are retained during application-only updates.

The API retains `POST /render/start`, `GET /render/{id}/status`,
`GET /render/{id}/result`, and `DELETE /render/{id}`. The product entry point is
`POST /projects/{id}/render` through Temporal.

Before publishing, verify health, exact frame count/duration, uploaded-footage
trims, scene/caption layout, sound timing, cancellation, queue recovery and
S3 result retrieval. Measure representative long projects on target workers.
No comparative After Effects/CapCut performance claim has been established.
