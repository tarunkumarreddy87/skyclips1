# Open-source readiness audit

**Repository:** [tarunkumarreddy87/skyclips1](https://github.com/tarunkumarreddy87/skyclips1)  
**Audited baseline:** `main` at `838db1a0de352c59887ce9b4774a0b751b5d8b7f`  
**Remediation branch:** `oss-readiness/audit-and-docs`  
**Audit date:** 2026-11-05  
**Scope:** GitHub tree and source inspection. This is a static audit; no repository code was executed in the connected environment.

## Executive summary

The repository contains a substantial monorepo: a Next.js application, FastAPI API, Temporal orchestrator and media worker, a TypeScript native render service, shared types/timeline schema, migrations, and several existing test suites. It has a meaningful custom rendering implementation. The video engine is not a replacement for FFmpeg: Skyclip owns timeline evaluation, SVG graphics composition, animation/keyframe evaluation, text layout, templates and audio-cue planning; FFmpeg remains central to media decode, filters, transitions, audio mixing, section/final assembly and encoding.

**Baseline readiness: Needs significant work.** The baseline lacked a repository-level licence, governance files, CI workflows and a root environment template. The remediation branch adds the missing onboarding/governance documentation, a local environment template, a CI workflow and a production fail-closed render-service API-key check. These additions are not yet merged and the workflow has not run. The remaining security concerns—SSRF-safe media ingestion and browser-renderer isolation—need engineering work.

## Repository facts observed on main

- Default branch: `main`; repository visibility: public.
- Repository tree contains approximately 980 tracked blobs at the audited ref.
- Existing tests: 73 test-related files by filename/path inventory (not a statement of passing tests or coverage).
- No `.github/workflows/` files were present at the baseline.
- No root `.env.example`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, or `CODE_OF_CONDUCT.md` was present at the baseline.
- An application-specific template exists at `apps/web/.env.example`; it does not cover the root Compose/API/worker setup.
- Root README identified the project as HANUMAN. Some application-facing text and env comments used SkyClip/Skyclip. Root package and Python package metadata also retained HANUMAN names.

## Findings

### Critical

No confirmed critical vulnerability was established by this static inspection. Runtime testing, deployment inspection, and dependency audit remain necessary before declaring the repository secure.

### High

1. **Node dependency graph contains unresolved critical/high advisories (confirmed by CI).**
   GitHub Actions run `41919145743` reports 130 advisories: 4 critical, 56 high, 60 moderate and 10 low. Examples include `next@15.5.20` (critical; listed patched floor at least `15.5.28` for the SVG optimizer advisory), `fastify@5.10.0` (high; patched floor `5.12.2`), and `proxy-addr@2.0.7` (critical; patched floor `2.0.8`). These are advisory findings in the dependency graph, not 130 proven exploitable Skyclip defects. Triage by dependency path, upgrade compatible direct/transitive packages and rerun tests. CI correctly fails this gate until findings are resolved.

2. **Render-service authentication was optional on the baseline (remediated in this branch and verified by CI).**  
   At the audited ref, `render-service/src/api/routes.ts` skipped key verification when `RENDER_SERVICE_API_KEY` was empty. The remediation branch now asserts a non-empty key at production service startup, and the container image sets `NODE_ENV=production`. A focused regression suite passed in CI (production missing/blank key is rejected; configured key is accepted; development/test remain usable). Deployments must supply a strong key.

3. **Remote media fetch can access arbitrary URLs (potential SSRF; confirmed code path, exploitability depends on manifest trust boundary).**  
   `workers/media/src/render/native_pipeline.py::stage_assets` calls `urllib.request.urlopen(src)` for HTTP(S) media without an evident scheme/host/IP allowlist or redirect revalidation. If a caller can cause a manifest to contain attacker-controlled URLs, the worker may reach internal services or cloud metadata endpoints. Add an allowlist/egress policy, reject loopback/private/link-local/reserved IPs after DNS resolution, revalidate redirects, and use size/time limits. Confirm all routes that can populate timeline source URLs before release.

4. **Untrusted HTML/JavaScript template execution requires a hardened sandbox (high risk, not confirmed exploitable).**  
   `render-service/src/native/validate-template.ts` and `render-html.ts` run template JavaScript in Chromium/Playwright. Request size/duration are bounded and browser network routing is restricted in the inspected process, but browser process isolation, OS sandbox/container privileges, CPU/memory limits and denial-of-service resistance require deployment verification. Never treat a browser route filter as a complete hostile-code sandbox. Consider running this renderer as a non-root user in a separately constrained container with no credentials and no network egress.

### Medium

1. **CI is newly added and partially verified.**  
   The baseline had no workflows. Run `41919145743` shows Compose validation and Gitleaks passing; video-engine tests 23/23; render-service tests 18 passed and 2 skipped; render-service typecheck/build passed; web typecheck passed and editor round-trip tests 3/3; orchestrator tests passed. The media-worker suite completed with 46 passed and 2 failed: both failures were in the Three.js export path because Playwright Chromium was absent from the GitHub runner, with a related cancellation/fallback-file assertion. The workflow now installs Playwright Chromium in both the Node renderer and media-worker jobs; those changes require a fresh passing CI run. API tests are blocked before pytest because its lockfile is stale. The dependency audit exits non-zero on the reported high/critical advisories.

2. **A root development environment template is newly added on the remediation branch.**  
   The baseline README quick start referenced a missing root `.env.example`. The remediation branch adds one with local development placeholders. Supabase placeholders are not working credentials; a user-owned Supabase project is required for real authentication.

3. **No repository licence has been selected.**  
   Public visibility does not grant reuse rights. The remediation branch deliberately does not add a licence. The maintainer must select one after reviewing source, dependencies, fonts, media and other third-party rights.

4. **Contributor and security governance files were absent at baseline and have been drafted on the remediation branch.**  
   The new Code of Conduct and Security Policy contain explicit maintainer-confirmation placeholders for a monitored contact/reporting channel; these must be resolved before inviting community reports.

5. **API dependency lock is stale.**
   The CI `uv sync --locked --extra dev` step for `apps/api` fails with `uv.lock needs to be updated`. Regenerate and commit the lock using the repository's current `pyproject.toml`; do not remove `--locked` from CI as a workaround.

6. **No consistent formatting/lint configuration.**
   The repository does not have a consistent formatter/linter command that CI can run across all workspaces. The new CI currently validates types, tests, builds and security but does not claim formatting/lint checks. Adopt per-language tools only after choosing and documenting project conventions.

7. **Project identity is inconsistent in historical files.**  
   Root README and the docs index now use Skyclip as the public-facing name, while internal npm/Python package identifiers and historical ADRs still use HANUMAN. These identifiers were not globally renamed because doing so could affect imports and deployment contracts.

8. **Root workspace scripts reference tasks that packages may not implement.**  
   Root `package.json` exposes Turbo `build`, `lint`, and `typecheck`, but the inspected `packages/video-engine/package.json` defines only `typecheck` and `test`; `render-service` defines `build`, `typecheck`, and `test`. Confirm task availability across all workspace packages and add explicit root test orchestration.

9. **Conflicting/legacy dependency declarations.**  
   The API has `pyproject.toml` and a separate `requirements.txt`; they do not list exactly the same packages (for example, Alembic is in pyproject but absent from requirements). Document the canonical install path or keep them synchronized.

10. **Package metadata remains private.**  
   `packages/video-engine`, `render-service`, and root package metadata use `private: true`. This may be intentional for an integrated application, but it means those packages are not currently published as public npm packages.

11. **Benchmark evidence is not an external reproducible report.**  
   The repository contains proof media/metric artifacts, and the ADR correctly says there is no measured basis for comparative speed claims. The benchmark plan was added to the branch, but no new benchmark was executed.

12. **Docker image dependency reproducibility needs review.**  
    Compose uses mutable tags such as `minio/minio:latest` and `minio/mc:latest`. Pin supported versions or digests for repeatable contributor setup.

### Low

1. Several docs describe workstation-specific GPU hardware and commands. Keep those as explicitly labelled maintainer proof notes, separate from portable contributor instructions.
2. Commits inspected through the recent commit endpoint were unsigned. Signed commits are optional, but branch protection and provenance policies should be documented if adopted.

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
- Chromium/Playwright captures supported HTML/GSAP templates and Three.js scene output.
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

**Static audit tests were not run in a local checkout.** CI did execute multiple suites on the remediation branch: video engine 23/23 passed; render service 18 passed and 2 skipped; web editor round-trip 3/3 passed; orchestrator suite passed. Media-worker pytest was still running when this document was updated; API pytest did not start because `uv sync --locked` detected a stale lockfile. No coverage percentage is claimed.

## Remaining remediation order

1. Remediate the 4 critical and 56 high Node dependency advisories, refresh the lockfile and verify all impacted application/render tests.
2. Regenerate `apps/api/uv.lock` from `pyproject.toml` and rerun the API suite.
3. Harden remote media fetching against SSRF and untrusted redirects.
4. Isolate HTML/JS rendering in a non-root, no-credentials, no-egress sandbox with resource limits.
5. Run the full CI workflow and fix remaining failures; maintain the dependency audit gate.
6. Select a project licence and check third-party dependency/font/media attribution compatibility.
7. Configure a private security-reporting channel and monitored community enforcement contact.
8. Reconcile Python API dependency metadata and root Turbo task coverage.
9. Run Docker Compose startup and all test suites on a clean machine.
10. Produce reproducible renderer benchmarks with hardware/configuration and cold/warm cache results.

## Audit limitations

This is a source-level review of a single baseline ref plus a proposed remediation branch. It does not prove the deployed environment, current secrets state, full dependency advisories, every file's correctness, actual output quality, or test/build status. Gitleaks, dependency scans, and runtime tests are defined in the branch but have not executed. Re-run those checks before release.
