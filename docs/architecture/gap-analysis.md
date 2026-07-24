# Gap Analysis

**Date:** 2026-07-07  
**Compares:** Current implementation vs intended architecture in `docs/architecture/*` and ADRs.

---

## Evaluation criteria

| Symbol | Meaning |
|--------|---------|
| ✅ | Matches target architecture |
| 🟡 | Partially implemented |
| ❌ | Missing |
| 🔧 | Refactor later (working but drifted) |

---

## 1. Quote-gated workflow

| Aspect | Target | Current | Status |
|--------|--------|---------|--------|
| Quote entity with approval | ADR-0002 | Full CRUD + state machine in API | ✅ |
| No workflow without approved quote | API enforces before `POST /generate` | `GenerationService` checks project + quote status | ✅ |
| No concurrent runs | Block active `queued`/`running` | `_active_run()` guard | ✅ |
| User edits quote before approve | PATCH quote while `pending_approval` | Implemented | ✅ |
| Quote inference from brief | LLM or rules | **Rule-based only** in `quote_inference.py` | 🟡 |
| Re-quote after approval | `approved → draft` on brief edit | Not exposed in UI/API | 🟡 |
| Activity-level quote check | `validate_brief` checks approved quote | Only checks prompt/script presence | 🟡 |
| Credit enforcement | Informational only (MVP) | Display only, no enforcement | ✅ (per ADR-0003) |

**Verdict:** Core gate works at API layer. Defense-in-depth in orchestrator is thin.

---

## 2. Durable Temporal orchestration

| Aspect | Target | Current | Status |
|--------|--------|---------|--------|
| `VideoGenerationWorkflow` | 7 stages + render | Implemented with branching | ✅ |
| Activities for all I/O | No I/O in workflow code | Correct separation | ✅ |
| Separate `media` task queue | Render on media worker | `task_queue="media"` for `render_video` | ✅ |
| Retry policies | Per-stage in docs | `RetryPolicy(maximum_attempts=3)` global-ish | 🟡 |
| Activity heartbeats (30s) | pipeline-stages.md | Not implemented | ❌ |
| Workflow ID idempotency | `video-gen-{project_id}` | **`video-gen-{run_id}`** in code | 🔧 |
| `fail_run` on all stages | Correct stage in failure event | Often reports `enqueue_render` | 🔧 |
| Temporal search attributes | `project_id`, `run_id` | Not configured | ❌ |
| Workflow cancellation | User cancels run | Not implemented | ❌ |

**Verdict:** Durable orchestration is real and functional. Operational/debug features and doc-aligned idempotency are gaps.

---

## 3. Timeline manifest as renderer contract

| Aspect | Target | Current | Status |
|--------|--------|---------|--------|
| `timeline.v1.json` schema | packages/timeline-schema | Schema + TS validator + fixtures | ✅ |
| Orchestrator produces manifest | `build_timeline` activity | Implemented with proportional durations | ✅ |
| Validate before handoff | build_timeline validates schema | **No validation in orchestrator** | 🟡 |
| Media validates before FFmpeg | Fail fast | `validate_manifest()` in media worker | ✅ |
| Actual TTS durations drive clips | Never estimate from text | ffprobe + proportional scaling | ✅ (after fixes) |
| Stock video clip support | `type: "video"` in schema | Renderer treats all as looped images | 🟡 |
| Captions track | Schema supports `captions[]` | Always empty array | 🟡 |
| Python shared validator package | CI-aligned | `hanuman_timeline_schema` incomplete | ❌ |
| Golden FFmpeg tests | media-pipeline rule | 2 schema tests only | 🟡 |

**Verdict:** Contract exists and works for image-based MVP. Validation is one-sided (media only). Shared Python validator package is broken.

---

## 4. Prompt-first and script-first entry paths

| Aspect | Target | Current | Status |
|--------|--------|---------|--------|
| Web forms for both paths | Create project UI | Dropdown + conditional fields | ✅ |
| API accepts both | `CreateProjectRequest` validation | Implemented | ✅ |
| Workflow branching | parse vs generate script | Implemented | ✅ |
| Script-first skips research | Configurable light/skip | **Always skipped** | 🟡 |
| Script file upload to S3 | `script_s3_key` on brief | API upload-url exists; web uses paste/file→text | 🟡 |
| `parse_script` reads S3 key | When text empty | Implemented in orchestrator | ✅ |
| E2E verified | Both paths | Prompt-first proven live; script-first API tests only | 🟡 |

**Verdict:** Code paths exist; script-first and S3 upload are not fully productized.

---

## 5. SSE progress updates

| Aspect | Target | Current | Status |
|--------|--------|---------|--------|
| Workers emit progress | HTTP → API internal | `ApiClient.emit_progress` | ✅ |
| Persist to Postgres | `progress_events` table | Implemented | ✅ |
| SSE to web | `GET /projects/{id}/progress` | DB poll every 1s, heartbeat comments | ✅ |
| Redis pub/sub write path | progress-events.md | **Not implemented**; direct DB write | 🔧 |
| `artifact_id` on completed stages | Per progress-events.md | Sometimes set in API model; often null in UI response | 🟡 |
| `artifact_type` in API response | Populated | Hardcoded `None` in `ProgressService._to_response` | 🟡 |
| Reconnect + historical fetch | UI guideline | Client polls `getLatestRun`; no REST events backfill on reconnect | 🟡 |
| Run terminal event with `artifact_id` | final_video on complete | `complete_run` emits type but not artifact id | 🟡 |

**Verdict:** User-visible progress works. Architecture doc over-specifies Redis; implementation is simpler (DB poll). Minor field population gaps.

---

## 6. Deterministic FFmpeg render pipeline

| Aspect | Target | Current | Status |
|--------|--------|---------|--------|
| No LLM in media worker | Invariant | Correct | ✅ |
| Manifest-only input | Invariant | Correct (+ S3 assets) | ✅ |
| 1920×1080, 30fps, H.264+AAC | Fixed output | Implemented | ✅ |
| Hard cuts only | MVP | concat demuxer | ✅ |
| Enforce resolution even if manifest wrong | media-pipeline rule | FFmpeg scale/crop filter | ✅ |
| Windows-safe subprocess | Production | DEVNULL stderr fix applied | ✅ |
| Stock video segments | Schema allows | Not implemented (images only) | 🟡 |
| Render progress to 100% | UI expectation | Media posts 85%; `complete_run` posts 100% | ✅ |

**Verdict:** Deterministic render MVP is solid for still-image B-roll.

---

## 7. Modular boundaries

| Boundary | Target | Current | Status |
|----------|--------|---------|--------|
| Web → API only | No Temporal/FFmpeg in web | Correct | ✅ |
| API → Temporal client only | No inline LLM/FFmpeg | Correct | ✅ |
| Orchestrator → no FFmpeg | Delegate to media | Correct | ✅ |
| Media → no LLM | Manifest only | Correct | ✅ |
| Shared types package | TS + Python aligned | Python missing some types | 🟡 |
| Internal API key for workers | Secured callbacks | Implemented | ✅ |
| User auth at API | Clerk/Auth0 per ADR-0003 | Dev user stub | ❌ |

**Verdict:** Service boundaries are respected. Auth is the main boundary gap.

---

## Summary matrix

| Pillar | Match | Partial | Missing | Drift |
|--------|-------|---------|---------|-------|
| Quote gate | 4 | 3 | 0 | 0 |
| Temporal | 4 | 1 | 3 | 2 |
| Timeline contract | 3 | 4 | 1 | 0 |
| Entry paths | 4 | 4 | 0 | 0 |
| SSE progress | 3 | 4 | 0 | 1 |
| FFmpeg render | 6 | 1 | 0 | 0 |
| Modular boundaries | 5 | 1 | 1 | 0 |

---

## Technical debt and architectural drift

### Drift (docs ≠ code)

| Item | Doc says | Code does |
|------|----------|-----------|
| Workflow ID | `video-gen-{project_id}` | `video-gen-{run_id}` |
| Progress transport | Redis pub/sub → DB | Direct HTTP → DB; SSE polls DB |
| `validate_brief` | Checks quote approval | Checks brief content only |
| `RunResearch` script-first | Lightweight or skip | Always skip |
| API workflow trigger | On quote approval | Manual/auto via web `POST /generate` after approve |

### Technical debt (no immediate breakage)

- Empty migration `0001_initial` alongside real `0002`
- `stub_ping` orphaned in orchestrator
- API config fields for worker secrets (noise in API package)
- `ProgressService` never populates `artifact_type`
- No `conftest.py`; duplicated test fixtures
- `docs/runbooks/local-dev.md` stale language
- No CI pipeline for tests, schema validation, or compose smoke
- Docker full-stack defaults `HANUMAN_STUB_MODE=true` while dev `.env` may differ

### Refactor later (do not block MVP)

- Replace rule-based quote inference with LLM-assisted inference
- Redis pub/sub for progress (only if DB polling becomes a bottleneck)
- Unify workflow ID strategy with Temporal idempotency policy
- Stock video clip rendering (not just looped images)
- Captions generation and burn-in
- Multi-language TTS beyond Sarvam `en-IN` default

---

## MVP success criteria (ADR-0003) vs reality

| Criterion | Status |
|-----------|--------|
| 1. Create documentary from prompt | ✅ |
| 2. User approves quote | ✅ |
| 3. Pipeline completes without manual intervention | ✅ (when infra + workers running) |
| 4. User downloads 1080p MP4 | ✅ |
| 5. Close browser and return to completed project | ✅ (state in Postgres) |
| 6. Listicle and script-first work same pipeline | 🟡 (coded + API tests; limited live verification) |

---

## Related documents

- [current-state-audit.md](./current-state-audit.md)
- [implementation-roadmap.md](./implementation-roadmap.md)
