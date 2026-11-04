# Security audit

**Audited ref:** `main` at `838db1a0de352c59887ce9b4774a0b751b5d8b7f`  
**Remediation branch:** `oss-readiness/audit-and-docs`  
**Date:** 2026-11-05  
**Method:** Static source inspection through GitHub. No runtime penetration test, dependency advisory scan, secret scan, or deployed-environment assessment was executed.

## Summary

No exposed secret value is reproduced here. The remediation branch addresses the render-service optional-auth configuration and its tests passed in CI. The first dependency audit of the workspace reports 130 advisories (4 critical, 56 high, 60 moderate, 10 low); this is a substantive unresolved blocker. SSRF-safe media fetching and browser-renderer isolation also remain open.

## Findings

### High — render service permitted unauthenticated access when the key was unset

**Evidence at audited main ref:** `render-service/src/api/routes.ts::verifyApiKey` returned without authentication when `config.RENDER_SERVICE_API_KEY` was empty. The variable was optional in `render-service/src/config.ts`; Compose supplied an empty default. The local Compose port bound to loopback, which limited that specific local exposure, but did not protect a deployment that published the service elsewhere.

**Impact:** Unauthenticated clients could submit/cancel/query render jobs and invoke the template validator if the service was network-reachable.

**Remediation in this branch:** `render-service/src/config.ts` now exports a startup security assertion. `render-service/src/index.ts` invokes it before registering routes or listening; production startup fails when the API key is absent or whitespace-only. The render-service Dockerfile sets `NODE_ENV=production`. A test covers missing, whitespace-only and configured keys, plus local development/test modes. The render-service README documents the deployment requirement.

**Status:** Code and focused tests passed in CI on the remediation branch. The change is not yet merged. This verifies the startup assertion unit behavior, not a full deployment penetration test. Every deployment using the container image must configure `RENDER_SERVICE_API_KEY`; otherwise startup now fails by design. Direct local TypeScript development remains in development mode.

### High — user-influenced remote media URL staging may enable SSRF

**Evidence:** `workers/media/src/render/native_pipeline.py::stage_assets` accepts HTTP(S) values and calls `urllib.request.urlopen` without visible hostname/IP restrictions, redirect revalidation, or explicit response-size bound in the inspected code. The API render route rejects cross-project storage keys, but URL ingestion is a distinct code path.

**Impact:** If attacker-controlled URLs can enter a render manifest, the worker may access internal network resources, including cloud metadata endpoints. Actual exploitability depends on all upstream manifest validation and trust boundaries.

**Recommendation:** Prefer owned object-storage keys. For any necessary external URLs, use a narrowly scoped allowlist; resolve and reject loopback, private, link-local, multicast, reserved and metadata IPs; revalidate every redirect; pin connection targets to validated addresses; set strict byte/time limits; and enforce network egress restrictions at the worker/container layer. Add tests for IPv4/IPv6 private ranges, DNS rebinding, redirects and oversized responses.

**Status:** Not fixed. Requires trust-boundary review and dedicated network tests.

### High — arbitrary template code runs in browser automation

**Evidence:** `render-service/src/native/validate-template.ts` and `render-html.ts` use Playwright/Chromium to load HTML/JS template documents. Network routing is restricted to a loopback document endpoint in the inspected paths and validation has a time limit and bounded input sizes.

**Impact:** Untrusted template code can still consume CPU/memory or exploit browser/runtime vulnerabilities. A browser request interceptor is not a complete security boundary.

**Recommendation:** Isolate browser rendering in a non-root ephemeral container/process with no cloud credentials, read-only filesystem, strict CPU/memory/PID/time limits, seccomp/AppArmor or equivalent, and no outbound network. Use patched Chromium and keep worker images current. Consider declarative SVG-only templates for untrusted contributor/user content.

**Status:** Requires deployment-level design and tests; not fixed in this branch.

## Positive controls observed

- API production configuration rejects stub mode and weak/default internal API keys in `apps/api/app/main.py`.
- Render start checks caller ownership of project and generation run and validates output-key prefix in `apps/api/app/api/routes/render.py`.
- Timeline graphics SVG rendering escapes text and rejects unsafe image schemes; tests cover script text and `javascript:` asset URLs.
- Media proxy endpoints require project access and validate project-scoped object keys.
- Native render jobs use bounded concurrency, process cancellation, retries and output frame-count checks in inspected paths.

These controls do not substitute for a full threat model or runtime test.

### Critical/High — known vulnerable Node dependency graph

**Evidence:** GitHub Actions run `41919145743` executed `pnpm audit --prod --audit-level high` against the current workspace lockfile. It reported **130 advisories: 4 critical, 56 high, 60 moderate and 10 low**. These are advisory findings and dependency paths, not 130 independently confirmed exploitable defects in Skyclip.

Examples from the report:
- `next@15.5.20`: Next.js critical advisories in the report include affected versions below `15.5.24` and a separate SVG image optimization advisory affecting versions through `15.5.27`; the listed patched floor for that latter advisory is `15.5.28`.
- `fastify@5.10.0`: several high advisories list `5.12.2` as the patched floor.
- `proxy-addr@2.0.7`: a critical advisory lists `2.0.8` as the patched floor.
- Other findings include `undici`, `fast-uri`, `brace-expansion`, `postcss`, `sharp`, `zod` and transitive tooling dependencies.

**Recommendation:** Triage the full SARIF/audit output by direct versus transitive dependency and runtime exposure. Upgrade direct dependencies within supported compatibility ranges, refresh `pnpm-lock.yaml`, and review transitive overrides individually. Run the web, render-service, editor, and media integration tests after each upgrade. Do not suppress these advisory IDs merely to make CI pass.

**Status:** Unresolved. The CI dependency audit is intentionally a failing gate while high/critical findings remain.

## Checks not performed

- Git history secret scanning and secret provider validation.
- Complete Python advisory coverage for internal editable packages. `pip-audit` reports local path dependencies as not found on PyPI and skips them; review these packages and bundled dependencies separately.
- Authentication and authorization integration tests against a running stack.
- SSRF, path traversal, command injection, upload abuse, resource exhaustion and browser sandbox penetration tests.
- Production cloud IAM, object-store policy, network ACL and deployment ingress review.

The CI definition added on the remediation branch includes Gitleaks, npm audit and pip-audit in independent jobs. Gitleaks passed on the latest completed push-triggered run. npm audit reported 130 advisories: 4 critical, 56 high, 60 moderate and 10 low. The Python audit matrix reported 8 advisories in 3 packages in the orchestrator/media environments:
- `anyio 4.14.1`: PYSEC-2026-4025, PYSEC-2026-4023 and PYSEC-2026-4024; listed fix version 4.14.2.
- `certifi 2026.6.17`: PYSEC-2026-4320; listed fix version 2026.10.18.
- `urllib3 2.7.0`: PYSEC-2026-4177, PYSEC-2026-4176 and PYSEC-2026-4175; listed fix version 2.8.0.
The audit tool skips local editable packages that are not published on PyPI; those need internal source review. The API Python audit cannot install because its lockfile is stale relative to pyproject. Do not state that the repository is free of secrets or vulnerabilities.
