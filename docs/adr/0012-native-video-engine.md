# ADR 0012: Owned video engine

Date: 2026-09-30. Status: accepted. Supersedes ADR 0009's rendering decision.

The existing editor shell is retained. New graphic and caption tools live in the
existing tools drawer. Projects continue to use the timeline.v1 manifest and the
Temporal generation/render workflow, including SSE progress and S3 artifacts.

## Runtime

`packages/video-engine` evaluates graphics at an explicit absolute timestamp.
Its pure SVG renderer draws captions, text, chapter titles, lower thirds, CTA,
animated image frames, shapes, data-driven bar charts, documentary templates,
and declarative scenes with independently timed layers. Transform keyframes
use times relative to the object. Browser preview overlays this SVG on native
video/image elements. Cloud export uses the same SVG function with resvg and
bundled OFL fonts. The rasterizer streams bounded raw RGBA frames directly into
FFmpeg, avoiding per-frame PNG compression, disk writes, and decoding.

This avoids browser screenshot capture for every export frame. It reuses proven
decoders/encoders rather than implementing video codecs. HTML/CSS remain the
editor interface; animation is evaluated from timeline time so seeking doesn't
depend on wall-clock playback or a mutable GSAP instance.

The Python media pipeline renders bounded concurrent sections, preserves gaps,
honors source trims, and mixes narration, music, SFX, and unmuted original video
audio. Transitions occupy the final part of the outgoing section and reveal the
incoming first frame. The next clip still starts at its authored boundary.
They never shorten captions, word timings, music, or the project duration.

The Node render service retains start/status/result/cancel endpoints, job limits,
progress, bounded retries, and S3 publication. It invokes the same Python pipeline.
Hardware encoding is selected only after an actual NVENC probe succeeds; CPU
libx264 is the fallback. This accelerates encoding, not every graphics operation.

## Editing and AI

Premium caption presets: cinematic, clean highlight, kinetic, editorial, plus
legacy styles. Known word timings are retained; absent clocks are estimated and
must not be described as speech alignment. Built-in fonts are bundled for export.

The agent uses a validated operation contract for media insertion, clipping,
transforms, graphic objects, charts, keyframes, animations, captions, audio,
settings, selection, and undo/redo. It can sample up to three downsized JPEG
frames from browser-readable uploaded videos for scene treatment. Selected
footage samples respect its source trim and clip duration; sampling stops when
the user cancels. These are
sparse visual evidence; they are not full video analysis, transcription, object
tracking, or segmentation. Failed CORS/media reads must fall back transparently.
Cloud planning uses the chosen vision model or a configured vision analysis
model before a text planner. Plans retain current model selection, saved template
lookup, media research, interruption, stale-plan checks, and all-or-nothing
application with one undo step. Undo/redo use the existing history directly.

Generation can select scene graphic treatments from the script. Chart values
must be grounded in supplied narration/data. User edits persist in project
snapshots and return in exports. Narration mixing/trimming remains available;
voice synthesis is handled by the existing project generation workflow.

## Running and verification

Install workspace dependencies with `pnpm install`. Install Python dependencies
with `uv sync` in `workers/media` (see its pyproject.toml) and the shared-types Python package. Set
`RENDER_ENGINE=native-local` for a local worker or `native-cloud` to require the
render service. `native` selects cloud when configured and local otherwise.

Useful variables:

| Variable | Purpose |
|---|---|
| RENDER_ENCODER | auto probes NVENC and falls back; explicit h264_nvenc requires working hardware |
| RENDER_PARALLEL_SECTIONS | concurrent section work; tune to CPU/memory |
| RENDER_FFMPEG_THREADS | per-process CPU thread budget |
| RENDER_CACHE_DIR | optional persistent section cache; enabled in local Compose |
| RENDER_CACHE_MAX_BYTES | best-effort cache size budget, default 5 GiB |
| RENDER_CACHE_TTL_SEC | old unused section expiry, default 7 days |
| RENDER_GRAPHICS_COMMAND | override graphics CLI command when packaged differently |
| RENDER_PYTHON_EXECUTABLE | render-service Python executable |
| RENDER_MAX_CONCURRENT | per-process job concurrency |
| RENDER_GLOBAL_MAX_CONCURRENT | shared Redis capacity slots; defaults to the per-process limit |
| REDIS_URL | durable native job storage and recovery; absence enables local memory mode |
| RENDER_SERVICE_API_KEY | protect internal render endpoints |

Verification includes TypeScript checks, timestamp/graphics unit tests,
schema validation, agent operation/round-trip tests, and a real FFmpeg export
test with raw footage, original audio, captions, chart animation, cancellation,
cache reuse, exact duration/frame count, and encoder fallback.

## Optional local NVIDIA GPU

GPU access is opt-in; the base Compose configuration remains usable on CPU hosts.
On Windows, Docker Desktop requires its WSL2 backend and a working NVIDIA Windows
driver. The inspected RTX 4050 Laptop GPU has 6 GiB of VRAM; actual host NVENC
probes at 320×180 and 1920×1080 succeeded. The original container lacked GPU
access despite listing the NVENC encoder. Encoder enumeration alone is not a
capability test. The engine probes 320×180 because this GPU rejects 128×128.

From the repository root, recreate only the renderer with the optional override:

```powershell
docker compose --env-file .env --env-file .env.local -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-render.yml -f infrastructure/docker-compose.gpu.yml up -d --build --no-deps render-service
```

Omit the second `--env-file` when `.env.local` does not exist. Preserve the same
Compose project name and existing overrides if the installation uses others.
The GPU override reserves one NVIDIA GPU and requests `compute,video,utility`
driver capabilities; `video` supplies encoding/decoding libraries. It leaves the
named section-cache volume intact. Do not use `down -v` to enable acceleration.
These prerequisites and reservations follow the official
[Docker Desktop GPU guide](https://docs.docker.com/desktop/features/gpu/),
[Compose GPU guide](https://docs.docker.com/compose/how-tos/gpu-support/), and
[NVIDIA capability documentation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html).

Verify the actual running container after recreation (substitute its name if
using a different Compose project):

```text
docker exec infrastructure-render-service-1 ffmpeg -hide_banner -loglevel error -f lavfi -i color=s=1920x1080:r=30:d=0.1 -frames:v 1 -c:v h264_nvenc -f null -
docker exec infrastructure-render-service-1 /app/.venv/bin/python -c "from src.render.native_pipeline import select_encoder; print(select_encoder('auto'))"
```

The first command must exit successfully; the second must print `h264_nvenc`.
`RENDER_ENCODER=auto` falls back to CPU encoding when that real probe fails;
explicit `h264_nvenc` requires successful GPU access. A GPU-enabled one-off
container using the existing render image also passed the 320×180 probe.

This configuration accelerates final section encoding. SVG rasterization,
existing FFmpeg filters/composition, audio processing and asset preparation still
use the CPU; the current pipeline does not enable NVDEC or zero-copy GPU
composition. Browser preview uses the host browser's graphics configuration and
Windows GPU preference, separately from Docker. A page cannot force a particular
physical GPU. GPU access therefore does not establish a speed target for a full
project: measure complete cold and cached exports on representative footage.

## Performance and scope

Benchmark representative 1-, 5-, and 20-minute projects at 1080p30. Record cold
and warm export time, encoding mode, peak memory, concurrency, cache hits,
artifact duration, and visual/audio checks. Asset acquisition, generation, and
analysis latency should be reported separately. There is no measured basis yet
for claiming faster rendering or better quality than After Effects or CapCut.

The checked-in ECS Fargate deployment uses CPU workers. GPU execution requires
an NVIDIA-capable EC2/container worker with drivers and the NVIDIA container
runtime; it is not provisioned by this change. Rasterization and compositing
remain CPU work in this version. Media, transitions, overlays and graphics are fused into one FFmpeg encode per
section. Only encoded sections and the final output require video scratch space;
use bounded scene lengths and provision space for downloaded assets and outputs. The service stores complete source timelines and job records in Redis when
configured. Atomic external-ID deduplication, shared capacity leases, fenced
updates and heartbeat renewal coordinate multiple instances. Startup recovery
restarts abandoned native attempts from their persisted source timeline after
lease expiry. A configured Redis outage fails/defer jobs; it never creates an
invisible in-memory queue. Memory mode is retained only when Redis is absent for
local development. Failed/cancelled submissions get fresh job IDs; live/completed
submissions reuse their existing outcome.
Generated scene sound cues use bundled original WAVs at their absolute timeline
positions and respect the SFX bus. Uploaded executable HTML/JavaScript templates
are not executed by this SVG engine; their preview exposes a documentary
fallback warning. Exact support requires conversion to declarative scene data.
Native media effects approximate the browser look; supported SVG graphic
content shares its drawing function, while complete frame parity still requires
visual comparisons on representative projects.
4K/HDR/3D compositing, optical-flow retiming, automatic subject tracking,
model fine-tuning, and a trained sound-design model are future work.

Authoring a curated deterministic template library provides consistent output
now. Fine-tuning should follow a licensed example dataset, edit-plan evaluations,
and visual quality ratings, rather than preceding a reliable render engine.

## Local integration evidence

The primary checkout and local application services on port 3000 use the native engine.
The previous port 3001 editor is stopped. The current shell, model selector,
preview tools and timeline layout are retained. Confirmed obsolete source and
package declarations were removed; recovery copies live outside active source.

The production web build, all three native/web/service TypeScript checks,
18 engine tests, 30 media tests, three agent snapshot round trips, and
16 render-service tests passed. The final cache changes passed three additional
unit checks and all eight real native-export proofs. The integrated provider
catalog, vision routing, research, proxy and storage suite passed 61 API tests.
Authenticated live model discovery also confirmed the configured Gemini default
and vision model are present in the provider catalog. A real request
through the deployed render service completed storage upload and returned a
valid 1920×1080 MP4 with exactly 30 frames and a one-second duration.

A separate 12-second 1080p30 synthetic demo took 88.004 seconds cold and
1.686 seconds with unchanged sections cached on a Windows CPU using libx264.
See `workers/media/proofs/native-engine-demo.metrics.json`; this is neither
a cloud nor a competitor benchmark. Local Compose now persists encoded
sections in a dedicated volume, with best-effort age and size eviction;
cache failure does not fail a completed export.

The deployed API also generated a 540p proxy, JPEG poster and filmstrip sprite
from the 12-second demo using its internal MinIO endpoint. Browser URLs retained
the public localhost endpoint. Preview derivation bounds decoder, filter and
encoder threads and writes standard full-range JPEGs.

### Rendering incident verification — 2026-09-30

Native v1.6 normalizes frame rate after timestamp filters. FFmpeg 7.x clears
link frame-rate metadata in `setpts`: this broke both `xfade` and the frame
count used by `tpad` when footage was shorter than its timeline slot. The worker
now verifies each encoded section's exact frame count before caching it.
The raw graphics producer treats a consumer-closing EPIPE as normal, while
encoder failures and incomplete outputs still fail the job.

Fifteen real-process renderer regressions passed, covering transformed
transitions, short-source holds, clean pipe closure, encoder failure, truncated
output rejection, audio, captions, and graphics. Six web state regressions,
four run-scoped download API tests, TypeScript checks, and the production web
build passed. Result pages retain failures across reloads and polling, reject
late outputs from earlier runs, and display export progress separately from
whole-generation progress.

The complete 20-section project passed a reduced-resolution NVENC export:
326.133 seconds, 9,784 frames at 30 fps, including the full narration, music,
transitions, captions, and sound cues. This preflight is a timing/functional
check; it is not a 1080p speed benchmark.
