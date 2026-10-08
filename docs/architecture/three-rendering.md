# Three.js clips in the native video engine

Implemented 2026-10-02. The editor layout stays intact. Select a video/B-roll clip and use the existing Graphics tool: Orbital globe, 3D data bars, or validated scene JSON. The editor agent uses `update_clip {itemId, threeScene}`; `null` restores footage. Existing captions, transformations, transitions, narration, music and SFX remain timeline layers.

## Architecture

A bounded declarative scene describes camera, lighting-compatible materials, primitive geometry, position/rotation/scale keyframes and angular velocity. Preview and export share `packages/video-engine/src/three-scene.ts`. Time is sampled absolutely, including the clip source in-point; seeking backwards, splitting and trimming do not depend on playback history.

The cloud worker bakes only Three.js source clips. Ordinary footage never starts Chromium. One browser is reused for a batch of missing scenes, with a fresh canvas per scene. Shaders compile before drawing. Scene data cannot execute JavaScript, fetch resources, load external models or define shaders.

The preferred capture path probes WebCodecs H.264 with hardware acceleration preferred, then software H.264 if the browser cannot use a hardware video encoder. Both avoid exporting raw pixels. A VideoFrame is created immediately from the Three.js canvas. Encoded Annex-B chunks stream over a random loopback endpoint to FFmpeg, which remuxes them without re-encoding. At most four frames/chunks are in flight. The API preference is not proof of the physical encoder adapter; the actual WebGL renderer string and requested encoder acceleration are recorded separately.

Workers without that capability use asynchronous WebGL render-target readback and a bounded binary RGBA stream into NVENC or libx264. There are no frame screenshots, PNG encode/decode steps, base64 frame transfers, or full-video frame arrays. A failed automatic capture attempt retries once using the raw path. Invalid scenes fail visibly; they are never replaced silently with original footage.

Baked sources enter the existing FFmpeg section compositor, which adds transitions, captions and graphics and mixes audio. Completed sections and baked Three.js sources use the existing bounded disk cache. Scene data, runtime/dependency digest, dimensions, frame count, FPS, source offset and encoder settings affect the source cache key. Timeline placement alone does not. Job-local file paths are normalized in section cache keys. Cached frame counts/resolution are probed before reuse.

Cancellation terminates browser/encoder child processes. The render page uses a restrictive content security policy and a worker-local random endpoint. GPU scene resources are disposed between scenes.

## Research and engineering basis

- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): shader precompilation, asynchronous render-target readback and disposal.
- [Chrome WebCodecs guide](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs): canvas VideoFrame input, encoder capability checks, queue control and frame lifecycle.
- [W3C AVC WebCodecs registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/): Annex-B H.264 chunks and parameter sets, allowing an FFmpeg remux.
- [Chrome headless GPU guidance](https://developer.chrome.com/blog/supercharge-web-ai-testing): headless flags alone do not establish GPU acceleration; drivers and the observed renderer matter.
- [NVIDIA FFmpeg guide](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html): minimizing transfers and using hardware encoding.

These are primary implementation documents and standards, not a claim that this renderer has been independently validated by research papers or beats After Effects/CapCut.

## Measurements

Windows laptop, Intel UHD WebGL via ANGLE/D3D11. Final mixed-video encoding used RTX 4050 NVENC. Measurements were taken while Docker builds were running and are indicative, not a controlled performance guarantee.

| Test | Result |
| --- | --- |
| 1920x1080, 30 FPS, 60-frame bar scene, raw binary capture | 22.47 seconds including browser setup; transfer dominated |
| Same bar scene, WebCodecs H.264 | 3.28 seconds including browser setup |
| 1920x1080, 30 FPS, 10-second / 300-frame Three.js clip, WebCodecs H.264 | 7.04 seconds including browser setup; 6.07 seconds for the scene job |
| 1920x1080 mixed proof: 6 seconds / 180 frames, 2-second 3D scene, two transitions, caption and audio | Initial measured export 13.96 seconds; cached export 1.44 seconds |
| 320x180 mixed main/B-roll Three.js integration | Exact 120 frames, audio, orientation, source trim and cache reuse passed |
| Local Docker worker, 1080p 60-frame Three.js scene, SwiftShader graphics | Raw capture 105.20 seconds; software WebCodecs capture 8.74 seconds including browser setup |
| Same Docker worker, 6-second mixed proof | Cold 31.16 seconds; cached 2.23 seconds; NVENC final encoding |
| Same Docker worker, HTTP queue → render → upload → downloaded MP4 | Completed in 26.42 seconds including polling/download/verification; exactly 180 frames, clean full decode |

The reproducible proof is `workers/media/scripts/prove_three_engine.py`; each run uses an isolated cache. Latest local output and measurements are in `workers/media/proofs/three-mixed/`. Do not extrapolate a six-second sample into a guaranteed 30-minute render time. A late 30-minute timeline placement is covered by a source-cache test; an entire 30-minute production export has not been benchmarked for this feature.

Docker measurements and the actual uploaded/downloaded video are saved in `workers/media/proofs/three-cloud/`. These verify the cloud-worker architecture on this laptop's Docker/WSL environment, not a deployment to a remote cloud GPU. Chromium reports SwiftShader here even though FFmpeg uses RTX 4050 NVENC. For full graphics acceleration, provision a worker with a verified hardware WebGL backend and enable `THREE_REQUIRE_GPU=1`; NVIDIA's [WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/index.html) also documents graphics/compute interoperability limits. Timings are individual runs under changing laptop load, not a controlled cross-product benchmark.

Inside the configured render-service container, run `PYTHONPATH=/app/workers/media /app/.venv/bin/python scripts/prove_three_engine.py --service` from `/app/workers/media` to include the queue and object-storage test. This writes a synthetic proof artifact under `proofs/three/`, without editing a user project. Omit `--service` for the filesystem-only proof.

## Configuration and deployment

Install workspace dependencies, and install Playwright Chromium for the render worker. The render-service Dockerfile includes Chromium and OS dependencies. Continue using both `.env` and `.env.local` with Docker Compose so public Supabase build variables remain available.

- `THREE_CAPTURE_MODE=auto` (default), `raw` (diagnostic/fallback), or `webcodecs` (require supported H.264 WebCodecs; hardware preferred, then software).
- `THREE_REQUIRE_GPU=1` rejects software WebGL rather than silently treating it as GPU rendering.
- `THREE_ANGLE_BACKEND=vulkan` is available for Linux hosts with verified Vulkan drivers; default uses Chromium adapter selection. Do not enable it blindly on Docker/WSL.
- `THREE_CHROMIUM_EXECUTABLE` optionally selects an installed Chromium binary.
- Existing `RENDER_ENCODER`, cache size/TTL and render concurrency settings still apply. The GPU Compose override also exposes NVIDIA graphics capability. NVENC availability alone does not prove headless WebGL acceleration.

The standard API manifest remains 1080p30. The underlying capture runtime validates even dimensions up to 3840 and FPS up to 60; these are internal limits, not a new public 4K export feature.

## Scope

This first release supports solid-background Three.js clips using box, sphere, ring, cone, cylinder and plane geometry; standard materials; camera orbit; object spin and smooth keyframe movement. It does not import arbitrary `.js` applications, GLTF models, external textures, transparent 3D overlays, physics simulations or custom postprocessing shaders. Existing HTML/JavaScript template imports do not automatically become Three.js scenes. A bounded scene contract keeps preview and final export deterministic and agent-editable.

## Verification

- Video-engine unit tests: scene validation, deterministic seeking and existing engine regressions.
- Web editor assertions: agent operation validation, application/removal, durable manifest roundtrip, split source-time continuity.
- API tests: scene normalization preserves nested fields and null removal; invalid executable/degenerate scenes rejected.
- Real Python integration tests: mixed main/B-roll 3D, captions, transition, audio, cache hits, trim, decoded frame orientation, ordinary-video bypass, late timeline placement and cancellation.
- Full FFmpeg decode and ffprobe frame/duration checks of the 1080p proof.
- Browser QA on the running editor: globe preset appears in the existing Motion & text tools, renders in the preview, and saves; Undo restores the original documentary scene. A proof screenshot is saved under `workers/media/proofs/three/preview-browser.jpg`.
