# Security audit

**Audited ref:** `main` at `838db1a0de352c59887ce9b4774a0b751b5d8b7f`  
**Date:** 2026-11-05  
**Method:** Static source inspection through GitHub. No runtime penetration test, dependency advisory scan, secret scan, or deployed-environment assessment was executed.

## Summary

No exposed secret value is reproduced here. This review found two high-priority hardening areas and one additional high-risk isolation area. Findings are tied to the source and should be revalidated after fixes.

## Findings

### High — render service permits unauthenticated access when the key is unset

**Evidence:** `render-service/src/api/routes.ts::verifyApiKey` returns without authentication when `config.RENDER_SERVICE_API_KEY` is empty. The variable is optional in `render-service/src/config.ts`; Compose supplies an empty default. The local Compose port binds to loopback, which limits that specific local exposure, but it does not protect a deployment that publishes the service elsewhere.

**Impact:** Unauthenticated clients could submit/cancel/query render jobs and invoke the template validator if the service is network-reachable.

**Recommendation:** Fail closed in production: require a non-empty high-entropy key (or authenticated service identity) at process startup; exempt only `/health`. Keep local unauthenticated mode opt-in and bound to loopback. Add tests for production startup without a key, health access, and protected route rejection.

**Status:** Not changed in this documentation-only branch.

### High — user-influenced remote media URL staging may enable SSRF

**Evidence:** `workers/media/src/render/native_pipeline.py::stage_assets` accepts HTTP(S) values and calls `urllib.request.urlopen` without visible hostname/IP restrictions, redirect revalidation, or explicit response-size bound in the inspected code. The API render route rejects cross-project storage keys, but URL ingestion is a distinct code path.

**Impact:** If attacker-controlled URLs can enter a render manifest, the worker may access internal network resources, including cloud metadata endpoints. Actual exploitability depends on all upstream manifest validation and trust boundaries.

**Recommendation:** Prefer owned object-storage keys. For any necessary external URLs, use a narrowly scoped allowlist; resolve and reject loopback, private, link-local, multicast, reserved and metadata IPs; revalidate every redirect; pin connection targets to validated addresses; set strict byte/time limits; and enforce network egress restrictions at the worker/container layer. Add tests for IPv4/IPv6 private ranges, DNS rebinding, redirects and oversized responses.

**Status:** Not changed in this documentation-only branch.

### High — arbitrary template code runs in browser automation

**Evidence:** `render-service/src/native/validate-template.ts` and `render-html.ts` use Playwright/Chromium to load HTML/JS template documents. Network routing is restricted to a loopback document endpoint in the inspected paths and validation has a time limit and bounded input sizes.

**Impact:** Untrusted template code can still consume CPU/memory or exploit browser/runtime vulnerabilities. A browser request interceptor is not a complete security boundary.

**Recommendation:** Isolate browser rendering in a non-root ephemeral container/process with no cloud credentials, read-only filesystem, strict CPU/memory/PID/time limits, seccomp/AppArmor or equivalent, and no outbound network. Use patched Chromium and keep worker images current. Consider declarative SVG-only templates for untrusted contributor/user content.

**Status:** Requires deployment-level design and tests; not changed here.

## Positive controls observed

- API production configuration rejects stub mode and weak/default internal API keys in `apps/api/app/main.py`.
- Render start checks caller ownership of project and generation run and validates output-key prefix in `apps/api/app/api/routes/render.py`.
- Timeline graphics SVG rendering escapes text and rejects unsafe image schemes; tests cover script text and `javascript:` asset URLs.
- Media proxy endpoints require project access and validate project-scoped object keys.
- Native render jobs use bounded concurrency, process cancellation, retries and output frame-count checks in inspected paths.

These controls do not substitute for a full threat model or runtime test.

## Checks not performed

- Git history secret scanning and secret provider validation.
- Full dependency CVE/advisory scan.
- Authentication and authorization integration tests against a running stack.
- SSRF, path traversal, command injection, upload abuse, resource exhaustion and browser sandbox penetration tests.
- Production cloud IAM, object-store policy, network ACL and deployment ingress review.

Do not state that the repository is free of secrets or vulnerabilities until those checks are completed.
