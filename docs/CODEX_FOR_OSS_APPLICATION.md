# Codex for OSS application draft

**Status:** Draft only. All claims below are limited to source-visible evidence. Applicant ownership, application eligibility, usage and impact statements need maintainer confirmation.

## Project

**Project name:** Skyclip (repository currently contains mixed HANUMAN/Skyclip identifiers; public name needs confirmation).  
**Repository:** https://github.com/tarunkumarreddy87/skyclips1

Skyclip is an AI-assisted video-generation and editing platform. The repository contains a Next.js frontend, FastAPI API, Temporal workflow/orchestration worker, Python media worker, Node render service and shared TypeScript rendering/timeline packages.

## Problem being addressed

The codebase is organized around producing editable timeline-based videos from project briefs and media assets, with a render pipeline that composes footage, graphics, captions, transitions and audio into MP4 output. The exact target user segment and product positioning should be confirmed by the maintainer.

## Rendering-engine work

The repository contains a custom deterministic engine in `packages/video-engine`. It implements timestamp-based timeline/media evaluation, keyframes and animation, SVG graphics and caption composition, documentary templates, declarative scene rendering, text layout and audio-cue planning. The browser preview and cloud export share graphic rendering logic.

The engine integrates rather than replaces FFmpeg. FFmpeg is used for media decode, filtering, transitions, audio processing, H.264/AAC encoding, section assembly and final muxing. Resvg rasterizes SVG output. Chromium/Playwright is used for supported HTML/GSAP and Three.js template/scene paths. GPU encoding is conditional on a successful encoder probe; this is not a zero-copy GPU composition pipeline.

## Open-source components

The repository includes source for the application and supporting rendering packages, plus tests and architecture decision records. **The repository has no root licence at the audited commit. It must not be described as legally open source until the maintainer chooses and adds a licence after reviewing third-party assets/dependencies and rights.**

The bundled fonts include OFL notices in the font directory. Other dependency and media-asset licensing requires a complete inventory.

## Maintainer role

**[NEEDS CONFIRMATION]** The applicant is the primary maintainer and can describe their individual authorship, design decisions, implementation scope and maintenance responsibilities. The GitHub repository owner is visible as `tarunkumarreddy87`, but this draft does not infer legal identity or the extent of contribution from repository ownership alone.

## Engineering challenges

Potential evidence-based topics:
- Keeping browser preview and export graphics deterministic through explicit timeline-time evaluation.
- Preserving transition timing without compressing the authored timeline.
- Streaming bounded RGBA graphics frames into FFmpeg and avoiding a per-frame PNG/disk path for the main SVG renderer.
- Coordinating render jobs with leases, retries, cancellation, progress and restart recovery.
- Supporting CPU encoding with optional NVENC after an actual capability probe.
- Handling rendering limits and fallbacks across SVG, HTML/GSAP and Three.js paths.

The exact personal challenges, decisions and time spent should be written by the maintainer.

## Why Codex would help

Codex could support maintainers and external contributors by helping:
- Navigate the multi-language monorepo and trace API-to-worker-to-renderer contracts.
- Add focused regression tests for timeline timing, scene composition, audio sync and job lifecycle.
- Review changes across TypeScript and Python boundaries.
- Improve docs, developer setup and reproducible benchmark tooling.
- Investigate security issues such as optional service authentication, URL ingestion/SSRF risk and browser-renderer isolation.
- Break rendering reliability work into reviewable pull requests.

## Contributor support plan

**[NEEDS CONFIRMATION]** Describe the intended contributor workflow, review turnaround, maintainer availability, and how Codex-generated changes will be reviewed and tested before merge.

## Evidence and missing information

- Repository contains existing tests across API, rendering service, media worker, orchestrator and video engine; test pass status was not established in this audit.
- No GitHub Actions workflows were present at the audited ref.
- No licence or repository-level contributor/security governance files were present at the audited ref.
- No independent benchmark was run in this audit.
- User/adoption metrics, active contributors, production deployment scale, revenue, customer stories and external usage are **not established** by this repository review and must not be claimed without evidence.
- **[NEEDS CONFIRMATION]** Maintainer's role and authorship.
- **[NEEDS CONFIRMATION]** Intended public licence and the scope of components/assets being licensed.
- **[NEEDS CONFIRMATION]** Product status and whether external contributions are currently accepted.
- **[NEEDS CONFIRMATION]** Any public users, deployments or benchmark results that the applicant intends to cite.

## Application positioning

A credible application should position Skyclip as a technically substantial but still maturing multi-runtime project. Emphasize verifiable engineering work, clear contribution opportunities, a licence that permits community use, security and CI improvements, and a concrete plan for using Codex to help maintainers review and test contributions. Do not imply Codex for OSS acceptance is guaranteed.
