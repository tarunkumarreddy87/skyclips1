# Rendering benchmarks

## Status

No new benchmark was executed for this audit. The repository contains proof media and metric JSON under `workers/media/proofs/`; those files have not been independently reproduced or normalized against a stated reference machine here.

Do not treat a metric file as a general performance promise. In particular, do not claim a fixed render time for 1-, 5-, 20-, or 60-minute videos without publishing the fixture, machine, encoder, software versions, cache state and output checks.

## Reproducible benchmark matrix

| Workload | Fixture | Primary metrics |
|---|---|---|
| Short | 10–30 seconds, 2–4 scenes | cold/warm duration, FPS, memory, output size |
| Medium | 3–5 minutes, 10–20 scenes | section throughput, cache hits, CPU/RAM |
| Long | 15–20 minutes, 40+ scenes | peak memory, throughput stability, failures/retries |
| Multi-scene | 20+ mixed image/video scenes | section scheduling, transition overhead |
| Captions | word-timed captions in multiple scripts | raster time, visual correctness |
| Motion graphics | SVG charts, text and keyframes | graphics FPS, raster time, visual parity |
| Audio | narration + music + SFX + original audio | mix duration, clipping/RMS and sync |

## Required environment record

Record:
- CPU model, core/thread count and RAM.
- GPU model/VRAM, driver, container runtime and whether GPU was actually used.
- OS, Docker version, Node, pnpm, Python and uv versions.
- FFmpeg/ffprobe version and configure flags.
- Render-service commit, engine version and encoder selection.
- Resolution/FPS, scene count, source codec/bitrate and duration.
- Section concurrency, render concurrency, cache volume type/size.
- Cold cache versus warm cache.

## Procedure

1. Generate deterministic local fixtures; do not use customer media.
2. Run each fixture at least three times with cold cache and three times with warm cache.
3. Capture wall-clock duration, per-section timing, frames produced, average FPS, process CPU/RSS peak, output byte count and cache hits.
4. Decode output with ffprobe and verify codec, resolution, FPS, frame count and duration.
5. Sample representative frames for visual review; verify audio duration, sync and peak levels.
6. Report median and range; keep asset download, AI generation and planning latency separate from render-only time.
7. Preserve exact commands, fixture hashes and raw metrics.

## Existing instrumentation

The media pipeline records per-section preparation, transition, graphics/composition/encoding and total timing to a profile file. The HTML and Three.js capture paths write metrics JSON. Section cache records cache hits. Confirm these outputs and their units against a known run before aggregating them into a published benchmark report.
