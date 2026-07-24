# Implementation Roadmap

**Date:** 2026-07-07  
**Based on:** [current-state-audit.md](./current-state-audit.md), [gap-analysis.md](./gap-analysis.md)  
**Principle:** Preserve working code; close gaps incrementally.

---

## Current maturity

| Layer | Maturity | Notes |
|-------|----------|-------|
| Infrastructure | **Beta** | Full compose stack; requires Docker Desktop |
| API | **Beta** | Complete MVP routes; dev auth only |
| Orchestrator | **Beta** | Live integrations; no automated tests |
| Media | **Beta** | Reliable for image B-roll; limited clip types |
| Web | **Alpha+** | Core flows only; minimal UX |
| Docs vs code | **Good docs, some drift** | Update docs as code changes |
| Production readiness | **Low** | No auth, CI, observability, or SLOs |

**Overall:** Strong **local MVP** — not ready for multi-tenant production.

---

## Do now vs defer

| Do now | Defer |
|--------|-------|
| Auth (Clerk or Auth0) per ADR-0003 | Billing / credit enforcement |
| Validate timeline in orchestrator `build_timeline` | Redis pub/sub for progress |
| CI: API tests + schema fixtures + media pytest | Full timeline editor |
| Fix `hanuman_timeline_schema` Python package OR remove it | Stock video clip rendering |
| Wire S3 script upload in web OR document paste-only MVP | Captions burn-in |
| Align architecture docs with workflow ID reality | Multi-language |
| Orchestrator stub-mode integration tests | YouTube publish |
| Operational runbook updates | Mobile app |

---

## Immediate fixes

**Goal:** Prevent repeat of known local failures; tighten contract without feature scope creep.

| # | Task | Effort | Rationale |
|---|------|--------|-----------|
| I1 | **Validate `timeline.v1.json` in `build_timeline`** before S3 upload | S | Fail fast in orchestrator; matches architecture |
| I2 | **Fix or remove broken `hanuman_timeline_schema` Python package** | S | Eliminate dead package; share validator with media |
| I3 | **Update `docs/runbooks/local-dev.md`** to match `make up` / `make up-all` | S | Reduce onboarding friction |
| I4 | **Populate `artifact_type` / `artifact_id` in progress API responses** | S | Matches progress-events contract; improves UI |
| I5 | **Add `conftest.py`** shared API test fixtures | S | Cleaner integration tests |
| I6 | **Document startup checklist** in README (Docker → migrate → workers) | S | Prevents "Failed to fetch" / 503 errors |

**Not immediate code changes:** Rewriting workflow ID scheme (works today with per-run IDs).

---

## Short-term milestones

### M1 — Contract hardening (1–2 weeks)

- [ ] Shared timeline validator module used by orchestrator + media
- [ ] Orchestrator integration tests with `HANUMAN_STUB_MODE=true` (no external APIs)
- [ ] Golden test: fixture manifest → expected FFmpeg command structure (media)
- [ ] `validate_brief` checks `quote_id` / approved status from workflow input
- [ ] Align `overview.md` workflow ID text with `video-gen-{run_id}` OR revert code to project-based ID with retry policy

**Exit criteria:** `pytest` + `pnpm validate-fixtures` pass in CI; stub-mode E2E test starts workflow and reaches `build_timeline`.

### M2 — Auth integration (1–2 weeks)

Per ADR-0003 (Clerk or Auth0):

- [ ] Web: provider middleware, sign-in UI
- [ ] API: verify JWT, upsert `User` by `external_id`
- [ ] Keep dev-user fallback when auth env vars unset
- [ ] Pass auth token from web through `/api` proxy

**Exit criteria:** Two distinct users see only their own projects.

### M3 — Entry path productization (1 week)

- [ ] Wire `POST /projects/{id}/upload-url` in script-first web flow
- [ ] Live E2E test: script-first documentary (stub mode)
- [ ] Live E2E test: prompt-first listicle (stub mode)
- [ ] Listicle-specific script/scene prompts audit (verify different from documentary)

**Exit criteria:** ADR-0003 success criteria #6 met with CI or documented manual test.

### M4 — CI / DX (3–5 days)

- [ ] GitHub Actions (or equivalent): `uv run pytest`, `pnpm validate-fixtures`, `pnpm typecheck`
- [ ] Optional: compose smoke job (`make up-all`, curl health)
- [ ] `.env.example` sync check

**Exit criteria:** PRs cannot merge with broken tests or invalid fixtures.

---

## Later enhancements

### Post-MVP product

| Enhancement | Depends on |
|-------------|------------|
| LLM-assisted quote inference | OpenRouter reliability + cost controls |
| Billing + credit enforcement | Auth + usage metering |
| Custom voiceover upload | `voiceover_s3_key` already in schema |
| Background music | Timeline schema v2 |
| Thumbnail generation | Post-render asset pipeline |
| Portrait 9:16 | New resolution policy + renderer paths |

### Platform / ops

| Enhancement | Notes |
|-------------|-------|
| Redis pub/sub for progress | Only if SSE latency at scale matters |
| Temporal search attributes | Debugging at volume |
| Activity heartbeats | Long-running live API stages |
| Workflow cancellation API | User-facing stop button |
| Observability (OpenTelemetry, structured logs) | Production requirement |
| Cloud deploy manifests | K8s/ECS beyond local compose |

### Refactors (when pain justifies cost)

- Consolidate progress percent mapping in one module (orchestrator + docs)
- Remove `0001_initial` empty migration in favor of squashed history (new envs only)
- Extract pipeline stage interfaces for easier testing
- Media worker: separate validate / render / upload activities for finer retries

---

## Recommended sequencing

```
Immediate fixes (I1–I6)
    ↓
M1 Contract hardening
    ↓
M4 CI (can parallel M1)
    ↓
M2 Auth
    ↓
M3 Entry path productization
    ↓
Later enhancements (prioritize by user demand)
```

---

## Single best next implementation step

**M1 / I1: Validate the timeline manifest in `build_timeline` using the shared JSON Schema, and fix the broken Python validator package so orchestrator and media use one code path.**

Why this step:

1. It is the **core architectural contract** between orchestrator and media — the most important boundary in the system.
2. It is **small, safe, and testable** — no UX or auth complexity.
3. It **prevents expensive FFmpeg failures** downstream (already seen in production debugging).
4. It unlocks **CI enforcement** (`validate-fixtures` + orchestrator tests) in the following step.

Do **not** start with auth or new features until the manifest handoff is bulletproof.

---

## Related documents

- [current-state-audit.md](./current-state-audit.md)
- [gap-analysis.md](./gap-analysis.md)
- [../adr/0003-mvp-scope.md](../adr/0003-mvp-scope.md)
