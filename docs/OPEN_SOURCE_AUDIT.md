# Open-source readiness audit

**Repository:** [tarunkumarreddy87/skyclips1](https://github.com/tarunkumarreddy87/skyclips1)  
**Audited ref:** `main` at `838db1a0de352c59887ce9b4774a0b751b5d8b7f`  
**Audit date:** 2026-11-05  
**Scope:** GitHub tree and source inspection. This is a static audit; no repository code was executed in the connected environment.

## Executive summary

The repository contains a substantial monorepo: a Next.js application, FastAPI API, Temporal orchestrator and media worker, a TypeScript native render service, shared types/timeline schema, migrations, and several existing test suites. It has a meaningful custom rendering implementation. The video engine is not a replacement for FFmpeg: Skyclip owns timeline evaluation, SVG graphics composition, animation/keyframe evaluation, text layout, templates and audio-cue planning; FFmpeg remains central to media decode, filters, transitions, audio mixing, section/final assembly and encoding.

**Readiness assessment: Needs significant work.** The main blockers are the missing repository-level licence and contributor/security governance, absent CI workflows, missing root environment template despite the quick-start instruction, and security hardening of render-service authentication and remote media fetching.

## Repository facts observed

- Default branch: `main`; repository visibility: public.
- Repository tree contains approximately 980 tracked blobs at the audited ref.
- Existing tests: 73 test-related files by filename/path inventory (not a statement of passing tests or coverage).
- No `.github/workflows/` files were present in the tree.
- No root `.env.example`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, or `CODE_OF_CONDUCT.md` was present.
- An application-specific template exists at `apps/web/.env.example`; it does not cover the root Compose/API/worker setup.
- Root README identifies the project as HANUMAN. Some application-facing text and env comments use SkyClip/Skyclip. Root package and Python package metadata also retain HANUMAN names.

## Findings

### Critical

No confirmed critical vulnerability was established by this static inspection. Runtime testing, deployment inspection, and dependency audit remain necessary before declaring the repository secure.

### High

1. **Render-service authentication is optional (confirmed by code).**  
   `render-service/src/api/routes.ts` skips key verification when `RENDER_SERVICE_API_KEY` is empty. `render-service/src/config.ts` makes the setting optional, and `infrastructure/docker-compose.yml` passes an empty default. Every non-health route is therefore unauthenticated in that configuration. Local Compose binds the service to loopback, but deployments must not expose it without authentication. Require a strong key in production and fail startup when absent; preserve a clearly scoped local-only mode.

2. **Remote media fetch can access arbitrary URLs (potential SSRF; confirmed code path, exploitability depends on manifest trust boundary).**  
   `workers/media/src/render/native_pipeline.py::stage_assets` calls `urllib.request.urlopen(src)` for HTTP(S) media without an evident scheme/host/IP allowlist or redirect revalidation. If a caller can cause a manifest to contain attacker-controlled URLs, the worker may reach internal services or cloud metadata endpoints. Add an allowlist/egress policy, reject loopback/private/link-local/reserved IPs after DNS resolution, revalidate redirects, and use size/time limits. Confirm all routes that can populate timeline source URLs before release.

3. **Untrusted HTML/JavaScript template execution requires a hardened sandbox (high risk, not confirmed exploitable).**  
   `render-service/src/native/validate-template.ts` and `render-html.ts` run template JavaScript in Chromium/Playwright. Request size/duration are bounded and browser network routing is restricted in the inspected process, but browser process isolation, OS sandbox/container privileges, CPU/memory limits and denial-of-service resistance require deployment verification. Never treat a browser route filter as a complete hostile-code sandbox. Consider running this renderer as a non-root user in a separately constrained container with no credentials and no network egress.

4. **No automated CI workflows.**  
   There are no tracked GitHub Actions workflows. Existing test suites and package scripts are not automatically verified on a clean pull request.

### Medium

1. **Root quick-start references a missing file.**  
   `README.md` says `cp .env.example .env`; no root `.env.example` is tracked. `apps/web/.env.example` exists but does not provide a complete local-stack configuration.

2. **No repository licence or governance files.**  
   Public visibility does not grant reuse rights. No root `LICENSE`, contribution guide, code of conduct, or security reporting policy exists. Do not add a licence until the maintainer selects one.

3. **Project identity is inconsistent.**  
   Root README and package metadata use HANUMAN while some web environment/config copy says SkyClip/Skyclip. Pick a public-facing name and distinguish internal package identifiers from product branding.

4. **Root workspace scripts reference tasks that packages may not implement.**  
   Root `package.json` exposes Turbo `build`, `lint`, and `typecheck`, but the inspected `packages/video-engine/package.json` defines only `typecheck` and `test`; `render-service` defines `build`, `typecheck`, and `test`. Confirm task availability across all workspace packages and add explicit root test orchestration.

5. **Conflicting/legacy dependency declarations.**  
   The API has `pyproject.toml` and a separate `requirements.txt`; they do not list exactly the same packages (for example, Alembic is in pyproject but absent from requirements). Document the canonical install path or keep them synchronized.

6. **Package metadata remains private.**  
   `packages/video-engine`, `render-service`, and root package metadata use `private: true`. This may be intentional for an integrated application, but it means those packages are not currently published as public npm packages.

7. **Benchmark evidence is not an external reproducible report.**  
   There are checked-in media proof assets/metrics, and the ADR correctly says there is no measured basis for comparative speed claims. A neutral benchmark procedure should record hardware/software versions, source fixtures, encoder choice, cold/warm cache, resource usage and output validation. Existing proof metrics should be traced to exact source workloads and hardware before being promoted as general results.

8. **Docker image dependency reproducibility needs review.**  
   Compose uses mutable tags such as `minio/minio:latest` and `minio/mc:latest`. Pin supported versions or digests for repeatable contributor setup.

### Low

1. Root `README.md` begins with HANUMAN while the desired public product name appears to be Skyclip; align naming and package namespace deliberately rather than performing blind global replacements.
2. Git commits inspected through the recent commit endpoint were unsigned. Signed commits are optional, but branch protection and provenance policies should be documented if adopted.
3. Several docs describe workstation-specific GPU hardware and commands. Keep those as explicitly labelled maintainer proof notes, separate from portable contributor instructions.

## Rendering engine verification

The repository contains a custom engine in `packages/video-engine` and an export pipeline in `render-service` plus `workers/media`.

**Owned Skyclip logic observed:**
- Absolute-time media clip evaluation and timeline duration logic: `packages/video-engine/src/timing.ts`.
- Keyframe and animation evaluation: `packages/video-engine/src/animation.ts`.
- SVG graphic and declarative motion-scene composition: `packages/video-engine/src/graphics.ts`, `scenes.ts`, `templates.ts`, `text-layout.ts`.
- Caption/graphics frame generation: `render-service/src/native/render-graphics.ts`.
- Shared audio cue selection and absolute-time sound planning: `packages/video-engine/src/audio.ts`.
- Media section construction, transitions, audio mixing and section cache integration: `workers/media/src/render/native_pipeline.py`, `motion_filters.py`, `section_cache.py`.
- Render job lifecycle, worker lease/retry/cancel handling and artifact publication: `render-service/src/jobs/`.

**External engines and dependencies:**
- FFmpeg/ffprobe perform decode, media filters, transitions, raw frame ingestion, audio mixing, encoding and final mux/assembly.
- Resvg rasterizes SVG graphics.
- Chromium/Playwright captures trusted HTML/GSAP templates and Three.js scene output.
- Three.js provides 3D scene primitives; WebCodecs may encode scene frames before transfer, with raw RGBA/FFmpeg fallback.
- Redis is used for durable render jobs when configured; S3-compatible object storage persists media/artifacts.

**Not supported or limited according to code/docs:**
- Uploaded arbitrary HTML/CSS/JavaScript is not generally equivalent to the native SVG declarative renderer; the two paths have distinct capabilities and the general-purpose uploader has known restrictions.
- Full GPU/zero-copy composition is not implemented; graphics rasterization and much of composition remain CPU work. NVENC selection accelerates encoding only when an actual probe succeeds.
- Complete browser/export visual parity is not established by code inspection alone.
- No independently verified performance comparison against CapCut, After Effects, or other products was made.

## Test inventory and execution status

Existing tests include:
- `packages/video-engine/src/engine.test.ts` and companion scene/audio tests.
- `render-service/src/**/*.test.ts` for routes, job storage/reliability, artifacts and template validation.
- `workers/media/tests/` for native export, manifest validation, cache, audio/graphics and engine selection.
- `workers/orchestrator/tests/` for pipeline/workflow activities.
- `apps/api/tests/` for API routes/services.

**Tests were not executed as part of this remote audit.** The GitHub connector provides file access but not a shell in the repository checkout. A local clone or CI run is required to report real results. No test pass/fail claims are made.

## Recommended remediation order

1. Add a root `.env.example` based on the actual Compose variables, with placeholders only and local-only defaults clearly labelled.
2. Enforce render-service authentication for production startup and add tests for missing-key behavior.
3. Harden remote URL ingestion with network egress restrictions and redirect/DNS/IP validation.
4. Add GitHub Actions for deterministic install, Python tests, TypeScript type checks/build/tests, and a dependency audit.
5. Add CONTRIBUTING, CODE_OF_CONDUCT, SECURITY and templates; select a licence only after maintainer confirmation.
6. Align README and package identity; add architecture, rendering, benchmarks, roadmap and Codex application evidence docs.
7. Run all test suites and Docker Compose startup on a clean machine; publish only reproducible benchmark data.

## Audit limitations

This is a source-level review at one branch/ref. It does not prove the deployed environment, current secrets state, full dependency advisories, every file's correctness, actual output quality, or test/build status. A secret scan and dependency audit were not executable through the GitHub source connector. Re-run those checks locally/CI before release.
