# Open-source contribution roadmap

This roadmap is source-derived. It does not imply that issues have been created or that dates are committed.

## P0 — security and release gates

### Remediate dependency vulnerabilities
- **Problem:** Current workspace audit reports 4 critical and 56 high advisories (130 total across severity levels); examples include Next.js, Fastify and proxy-addr.
- **Relevant files:** `apps/web/package.json`, `render-service/package.json`, `pnpm-lock.yaml`, dependency package manifests.
- **Expected behavior:** Upgrade compatible direct dependencies and refresh transitive dependencies without broad, unexplained suppressions.
- **Acceptance criteria:** `pnpm audit --prod --audit-level high` exits successfully; no high/critical advisories remain or each exception has a documented, risk-reviewed temporary waiver.
- **Testing:** Run affected web/editor/render-service builds and tests after every dependency group update.

### Regenerate the API dependency lock
- **Problem:** `apps/api` CI setup fails because `uv.lock` is stale relative to `pyproject.toml`.
- **Relevant files:** `apps/api/pyproject.toml`, `apps/api/uv.lock`.
- **Expected behavior:** A current lockfile faithfully represents the project metadata.
- **Acceptance criteria:** `uv lock --check` and `uv sync --locked --extra dev` succeed on a clean Python 3.12 runner.
- **Testing:** Run the complete API pytest suite after lock regeneration.

### Require render-service authentication in deployed environments
- **Problem:** Non-health routes are unauthenticated when `RENDER_SERVICE_API_KEY` is unset.
- **Relevant files:** `render-service/src/config.ts`, `render-service/src/api/routes.ts`, `render-service/src/api/routes.test.ts`, `infrastructure/docker-compose.yml`.
- **Expected behavior:** Production startup fails closed without configured authentication; health remains accessible; local insecure mode requires explicit opt-in.
- **Acceptance criteria:** Tests cover unset key, empty key, wrong key, valid key and production startup.
- **Testing:** Render-service unit tests and production-config startup test.

### Prevent server-side request forgery through media URLs
- **Problem:** The media worker fetches HTTP(S) assets from timeline manifests without an evident destination policy.
- **Relevant files:** `workers/media/src/render/native_pipeline.py`, manifest schema, API render/generation routes.
- **Expected behavior:** Prefer project-owned object keys; external fetches, where needed, are allowlisted and reject private/internal destinations and unsafe redirects.
- **Acceptance criteria:** Unit/integration tests cover private IPv4/IPv6, DNS changes, redirect-to-private, metadata endpoints, oversized payloads and timeout.
- **Testing:** Network-isolated test server plus security regression suite.

### Isolate HTML/JS rendering
- **Problem:** Browser automation executes template scripts and must be hardened against untrusted code/resource exhaustion.
- **Relevant files:** `render-service/src/native/validate-template.ts`, `render-html.ts`, Dockerfiles and deployment manifests.
- **Expected behavior:** Browser workload runs without credentials and with OS/container resource and egress restrictions.
- **Acceptance criteria:** Documented threat model and tests that prove network isolation, CPU/memory/time ceilings, and process cleanup after cancellation.
- **Testing:** Container-level integration tests on CI runner.

## P1 — contributor experience

### Root environment template
- **Baseline issue:** Main README quick start called for a root `.env.example`, which was missing. The remediation branch adds a local-only root template.
- **Relevant files:** `README.md`, `infrastructure/docker-compose.yml`, service config modules.
- **Expected behavior:** A complete root template documents every variable needed for local Compose with safe placeholders and local-only defaults.
- **Current evidence:** Compose configuration validation passed in CI with the new sample. Supabase placeholder values remain non-functional; test real auth only with a project you control.
- **Acceptance criteria:** `cp .env.example .env` works for local configuration; compose config validates; no real secrets appear.
- **Testing:** `docker compose --env-file .env.example -f infrastructure/docker-compose.yml config` (or an equivalent sanitized env check).

### Continuous integration
- **Baseline issue:** No GitHub Actions workflow existed. The remediation branch adds CI, with several checks verified but two known gates currently failing (API lockfile and Node advisories).
- **Relevant files:** `.github/workflows/`, root package scripts and individual package manifests.
- **Expected behavior:** Clean checkout installs dependencies and runs Python tests, TypeScript type checks/build/tests, and security/dependency checks.
- **Current evidence:** video-engine, render-service and web checks passed; orchestrator tests passed; Compose and Gitleaks passed. API tests are blocked by a stale lockfile, media tests remain pending, and dependency audit reports high/critical advisories.
- **Acceptance criteria:** CI is green on a clean runner; optional system-dependent integration tests are clearly marked.
- **Testing:** GitHub Actions pull_request and push runs.

### Documentation and governance consistency
- **Problem:** HANUMAN and Skyclip naming is mixed; legal/community policies are missing or need maintainer confirmation.
- **Relevant files:** `README.md`, package metadata, docs, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`.
- **Expected behavior:** One public product name, explicit project status and truthful current limitations.
- **Acceptance criteria:** Root docs, package names and contributor entry points agree; reporting contact is operational.
- **Testing:** Link checker and documentation review.

## P2 — rendering reliability

### Expand deterministic timeline and media tests
- **Problem:** Existing tests cover substantial cases but each supported transition, audio mode, captions, HTML/3D template and cache boundary must be maintained with small fixtures.
- **Relevant files:** `packages/video-engine/src/*.test.ts`, `workers/media/tests/`, `render-service/src/**/*.test.ts`.
- **Expected behavior:** A regression test accompanies every renderer defect and checks time, frame count and output content.
- **Acceptance criteria:** Tests cover timeline boundaries, transforms, overlays, captions, transitions, audio sync, cancel/retry and output validation.
- **Testing:** Node test runner and pytest, with FFmpeg fixtures and no paid APIs.

### Add render observability and benchmark harness
- **Problem:** Performance metrics are generated in some paths but there is no standardized reproducible benchmark suite/report.
- **Relevant files:** `workers/media/scripts/`, `workers/media/proofs/`, `render-service/src/native/`, `docs/BENCHMARKS.md`.
- **Expected behavior:** Deterministic 10s/5m/20m workloads with hardware/configuration capture.
- **Acceptance criteria:** Raw data and repeatable commands are published; cold/warm cache and CPU/GPU encoder results are separate.
- **Testing:** Run at least three trials per fixture and validate MP4 frame count/audio.

### Reconcile package and dependency metadata
- **Problem:** API dependency metadata exists in pyproject and requirements files; root workspace task support differs by package.
- **Relevant files:** `apps/api/pyproject.toml`, `apps/api/requirements.txt`, `package.json`, `turbo.json`, package manifests.
- **Expected behavior:** A single documented source of truth per runtime and complete root validation scripts.
- **Acceptance criteria:** Clean install/build/test matrix is documented and reproducible.
- **Testing:** Install from lockfiles in fresh containers.
