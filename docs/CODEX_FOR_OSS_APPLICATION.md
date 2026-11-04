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

The repository includes source for the application and supporting rendering packages, plus tests and architecture decision records. The remediation branch contains a root `LICENSE` file with Apache License, Version 2.0. Confirm that the maintainer has authority to license all project-authored code under Apache-2.0, and complete a third-party dependency, font, media and asset notice review before making broader rights claims.

The bundled fonts include OFL notices in the font directory. Other dependency and media-asset licensing requires a complete inventory.

## Maintainer role

The applicant states they are the primary developer and maintainer of Skyclip. The final application should support that role with concrete examples of personally implemented components, design decisions, commit links and ongoing maintenance responsibilities. **[NEEDS CONFIRMATION: add 2–4 representative commit/PR links and a concise account of the applicant's individual contribution.]**

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

**[NEEDS CONFIRMATION]** Describe the intended contributor workflow, realistic review turnaround, maintainer availability, and how Codex-generated changes will be reviewed and tested before merge.

## Evidence and missing information

- Repository contains existing tests across API, rendering service, media worker, orchestrator and video engine; test pass status was not established in this audit.
- No GitHub Actions workflows were present at the audited baseline ref. The remediation branch adds CI; the first successful checks include 23/23 video-engine tests, 18 render-service tests passed with 2 skipped, 3/3 editor round-trip tests, successful render-service typecheck/build and web typecheck, successful orchestrator tests, and successful Compose/Gitleaks checks.
- The baseline had no root licence or repository-level contributor/security governance files. The remediation branch now includes Apache-2.0 `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md`; security and conduct reporting contacts remain unconfigured.
- No independent benchmark was run in this audit.
- The Node production dependency audit reported 130 advisories (4 critical, 56 high, 60 moderate and 10 low). The Python audit reported 8 advisories across AnyIO, Certifi and urllib3 in the orchestrator/media environments. API tests are blocked until its uv lockfile is regenerated. The earlier media suite had 46 passed and 2 failed because Chromium was missing; the workflow now installs Chromium and a rerun is pending. These are current application-readiness blockers, not claims that dependency exploits were demonstrated.
- User/adoption metrics, active contributors, production deployment scale, revenue, customer stories and external usage are **not established** by this repository review and must not be claimed without evidence.
- **[NEEDS CONFIRMATION]** Representative commit/PR evidence and a concise explanation of the applicant's individual authorship and design decisions.
- **[NEEDS CONFIRMATION]** Confirm maintainer authority to license project-authored code under Apache-2.0; inventory and attribute third-party code, fonts, media, datasets and other assets.
- **[NEEDS CONFIRMATION]** Product status and whether external contributions are currently accepted.
- **[NEEDS CONFIRMATION]** Any public users, deployments or benchmark results that the applicant intends to cite.

## Application positioning

A credible application should position Skyclip as a technically substantial but still maturing multi-runtime project. Emphasize verifiable engineering work, clear contribution opportunities, a licence that permits community use, security and CI improvements, and a concrete plan for using Codex to help maintainers review and test contributions. Do not imply Codex for OSS acceptance is guaranteed.
