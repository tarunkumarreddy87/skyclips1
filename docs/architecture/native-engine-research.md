# Native video engine: research and implementation decision

Reviewed 2026-09-30. This is a selected review of primary documentation and
research, not an exhaustive review of every editor or paper. The existing
port-3000 editor design is retained; new capabilities belong in its tools.

## Recommended architecture

Own the timeline, scene language, animation evaluator, preset library, and agent
operation contract. Reuse maintained video codecs and rasterizers. HTML/CSS
remain useful for editor controls; exported animation must be a function of the
requested timestamp. A mutable browser animation playing in real time is not a
reliable export clock.

The implemented first version draws SVG graphics in both browser preview and
cloud resvg, streams raw RGBA frames into FFmpeg, renders bounded concurrent
sections, caches unchanged sections, and mixes audio on absolute timeline time.
This avoids screenshotting a browser for each frame. SVG support is deliberately
limited to declarative content; resvg is a static SVG rasterizer rather than a
general HTML/JavaScript execution environment. [resvg](https://github.com/linebender/resvg)

After Effects itself uses parallel frame rendering and caching; its performance
depends on resources and effects. Our inference is that profiling, bounded
parallel work, and cache reuse are more credible optimizations than claiming
one programming language produces universally faster renders.
[Adobe multi-frame rendering](https://helpx.adobe.com/after-effects/desktop/render-and-export/multi-frame-rendering/multi-frame-rendering.html)

## Options compared

| Option | Fit for this project | Decision |
|---|---|---|
| Browser HTML/CSS/GSAP capture | Broad DOM authoring; requires deterministic seeking, browser startup, fonts, capture and codecs | Avoid as the default cloud frame path |
| Shared SVG scene evaluator + resvg + FFmpeg | Editable text, frames, charts and layers; bounded headless export | Implemented first engine |
| WebCodecs + WebGPU compositor | Promising browser decode/effects and future shared GPU renderer; device/codec availability varies | Future preview/compositor work after profiling |
| GPU cloud decode/composite/encode | Strong throughput potential when frames stay on device | Future worker provisioning and GPU compositor |
| Generative video diffusion for every edit | Can alter imagery; adds latency and weaker exact typography/data control | Optional media-generation tool, separate from deterministic graphics |

WebCodecs exposes available codecs without guaranteeing a particular supported
codec. Mediabunny adds container parsing/writing and pipelined browser decode
around that API; it is useful to evaluate for future frame-accurate browser
sources, not necessary to replace existing cloud FFmpeg immediately.
[WebCodecs](https://www.w3.org/TR/webcodecs/),
[Mediabunny](https://mediabunny.dev/guide/introduction)

FFmpeg supplies composition, transition, audio and codec building blocks. NVENC
and NVDEC accelerate encode/decode; uploading CPU-rendered graphics to a GPU
still has a transfer cost. The implementation probes hardware rather than
assuming an encoder name proves a usable GPU. End-to-end GPU compositing is a
separate engineering task.
[FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html),
[NVIDIA GPU pipeline guide](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html)

## Agent and motion-quality research

VideoAgent studies shot planning, multimodal retrieval, and specialized editing
tools. Crayotter emphasizes inspectable intermediate artifacts, recovery, and
long-form workflow control. Aurora uses a vision-language agent to turn an
underspecified request into a structured plan before a generative edit. These
are research systems; their reported scores do not validate our implementation.
[VideoAgent](https://arxiv.org/abs/2606.23327),
[Crayotter](https://arxiv.org/abs/2606.07636),
[Aurora](https://arxiv.org/abs/2605.18748)

Our inference: keep scene analysis, editorial planning, and rendering separate.
Give the agent typed operations with validation, undo, cancellation, evidence,
and observable progress. Use curated motion treatments for editorial roles:
chapter openings, comparisons, chart explanations, archival frames, callouts,
and lower thirds. Premium typography requires safe margins, readable line
length, bundled fonts, restrained animation and a hierarchy tailored to each
scene. Add sound cues at motion events, respect mute/volume, duck music under
speech, and retain original footage audio when selected.

The implemented agent samples a few uploaded-video frames and proposes validated
edits. It does not yet provide comprehensive shot detection, speech alignment,
object tracking, or a trained motion/sound model. The preset library is curated;
model fine-tuning has not been performed. Licensed edit examples and evaluations
should precede training. Footage-organization and assembly tasks can be evaluated
independently using ideas from the AVE benchmark.
[Anatomy of Video Editing](https://arxiv.org/abs/2207.09812)

## Acceptance and next engineering work

Verify rendered MP4s, seeking, captions, graphic/object movement, chart grounding,
sound timing, trims, cancellation, recovery, and snapshot round trips. Measure
cold and unchanged-cache export separately on representative 1-, 5- and 20-minute
projects. Record hardware, codec, concurrency, frame count, memory and scratch
usage. There is no measured basis for saying this engine is the world's fastest
or exceeds After Effects/CapCut's full feature set.

Priorities after this first version: whole-frame preview/export parity for
template plates and effects; representative long-project profiling; safe GPU
worker rollout; declarative conversion of uploaded HTML templates; richer shot,
speech and subject analysis; then licensed-data training and visual evaluations.

## Provider compatibility verification

The active local provider uses Gemini through its OpenAI-compatible endpoint.
Model discovery sends bearer authentication, normalizes resource IDs and uses
same-host native model metadata for context and supported methods. The native
metadata API uses an API-key header. The catalog retains OpenRouter modality
metadata when that provider is selected; visual planning uses a catalog-verified
vision model and reports the model used.
[Google compatibility](https://ai.google.dev/gemini-api/docs/openai),
[Google model metadata](https://ai.google.dev/api/models),
[OpenRouter model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties).
