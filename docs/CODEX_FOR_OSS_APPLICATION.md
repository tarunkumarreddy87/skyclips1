# Codex for OSS application draft

**Status:** Application preparation draft. Public program criteria were checked against OpenAI's official Codex for OSS page and terms. This is not submitted. Complete the applicant-specific facts and verify current program fields before submitting. Never claim adoption, usage, impact, maintainer duties, or ownership without evidence.

## Form-ready application text (verify before submitting)

The official form requires identity/account details, public GitHub identity and repository, a Primary or Core maintainer selection, a qualification statement (maximum 500 characters), an OpenAI Organization ID, and a project API-credit use statement (maximum 500 characters). Use the exact email associated with the applicant's ChatGPT account. The Organization ID must come from the applicant's account/workspace; do not guess or publish it in this repository.

**Suggested role:** Primary maintainer — select this only if accurate and verifiable from repository control and actual ongoing maintenance.

**Qualification statement (under 500 characters; no adoption claim):**

> Skyclip is a public, actively developed AI video-generation and editing platform with a custom timeline/video engine and a multi-service rendering pipeline. I maintain the project and am improving its contributor documentation, CI, security posture, and reproducibility. The project addresses the engineering challenge of deterministic motion graphics and timeline-based video export across browser and media-processing runtimes. Repository: https://github.com/tarunkumarreddy87/skyclips1

Before using this, substantiate “I maintain” and “actively developed” with your actual role, recent commits, and maintenance activity. If the project is not yet accepting outside contributors, say that clearly in the optional notes.

**API-credit use statement (under 500 characters):**

> API credits would support development and testing of Skyclip's open-source video-generation workflows: script and scene planning, regression tests for timeline/render behavior, contributor-facing automation, and CI-assisted code review. I would track usage against specific engineering tasks, keep credentials out of the repository, and review generated changes before merging. Credits would be used only for Skyclip project work.

This statement is an intended use plan, not a claim that the workflow is already deployed.

**Optional additional information (under 500 characters; personalize):**

> Skyclip is still maturing. I am addressing reproducible setup, test reliability, dependency findings, SSRF protections for remote media, and isolation for browser-based rendering. I can provide links to my representative commits and explain the design decisions and maintenance responsibilities. I will not claim user/adoption metrics or benchmark results unless I can verify them.

Add two or three links to representative commits or merged PRs that demonstrate your own contributions, and explain what you personally designed, implemented, reviewed, and maintain. Do not submit this text until those statements match the applicant's real work.

## Project

**Project name:** Skyclip. The source tree still contains legacy HANUMAN identifiers in package and environment metadata; clarify whether these are historical internal names or need renaming before public release.  
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

**[NEEDS CONFIRMATION]** State whether outside contributions are currently accepted. If yes, give an honest review cadence and explain that Codex-generated changes are reviewed, tested, and approved by a human maintainer before merge. Do not promise a turnaround SLA that cannot be maintained.

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

A credible application should present Skyclip as a public, technically substantial project that is still maturing. Focus on verifiable maintainer work, the project's specific engineering contribution, evidence of active maintenance, and a concrete API-credit plan. Public program guidance says OpenAI reviews usage, ecosystem importance, active maintenance, and maintainer responsibilities; selection remains discretionary. Do not imply acceptance is guaranteed.
