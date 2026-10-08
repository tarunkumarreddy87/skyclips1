# ADR 0003: MVP Scope

## Status

Accepted

## Date

2026-07-06

## Context

HANUMAN targets production-grade architecture but must ship a demonstrable MVP without unbounded scope. We need explicit boundaries so implementation stays focused and the first vertical slice is achievable.

## Decision

### In scope for MVP

| Area | Scope |
|------|-------|
| **Entry paths** | Prompt-first and script-first project creation |
| **Format modes** | Documentary and listicle |
| **Approval** | Quote statement with edit and approve |
| **Pipeline** | Research → script → voice → scene plan → timeline → render |
| **Output** | 1080p (1920×1080), 16:9, H.264 MP4 |
| **Visuals** | Static images or simple stock clips per scene; hard cuts only |
| **Progress** | Stage-based progress in UI via SSE |
| **Infrastructure** | Docker Compose local stack; cloud-ready layout |
| **Auth** | Better Auth + MongoDB Atlas — see [ADR 0011](./0011-platform-stack-better-auth-mongo-dodo.md) (supersedes Clerk/Auth0) |

### Out of scope for MVP

| Area | Deferred to |
|------|-------------|
| Billing and payments | **In progress** — Dodo Payments checkout/webhooks per [ADR 0011](./0011-platform-stack-better-auth-mongo-dodo.md); credit enforcement still deferred |
| Credit enforcement | Post-MVP |
| Mobile app | Post-MVP |
| Advanced motion graphics | Post-MVP — **partially overridden by [ADR 0007](./0007-element-transform-animation.md)** (schema) and **[ADR 0012](./0012-native-video-engine.md)** (owned SVG/FFmpeg export path) |
| Full timeline editor / NLE | Post-MVP — **source in-point trim only overridden by [ADR 0008](./0008-source-trim-defer-nle.md)** (no ripple/multi-select) |
| Chat-based editing | Post-MVP — **superseded in part by [ADR 0004](./0004-editor-agent-v1.md)** (Editor Agent v1: timeline ops only, no TTS) |
| Custom voiceover upload | Post-MVP (schema reserved) |
| Thumbnail generation | Post-MVP |
| Background music | Post-MVP — **partially overridden by [ADR 0005](./0005-editor-lanes-population.md)** (mood-matched library/synth beds only; not custom composition) |
| Multi-language (beyond English) | Post-MVP |
| YouTube publish integration | Post-MVP — see [ADR 0006](./0006-social-publish-scheduling.md) |
| Social schedule (FB / IG / LinkedIn) | Post-MVP — see [ADR 0006](./0006-social-publish-scheduling.md) |
| Source blacklisting / brand profiles | Post-MVP — **overridden by [ADR 0010](./0010-brand-profiles.md)** (client store + UI; worker enforcement deferred) |
| Portrait (9:16) or other resolutions | Post-MVP |

### First vertical slice (before full MVP)

Build one path end-to-end first:

> Documentary · prompt-first · ~2 minutes · 3–5 scenes · static image B-roll · hard cuts · 1080p MP4

Listicle mode and script-first entry are MVP scope but come **after** the first slice works.

## Rationale

VidRush-style platforms are judged on whether a full video emerges from a prompt. The narrow slice proves every architectural boundary (web → API → Temporal → S3 → FFmpeg → UI) with minimal AI surface area.

Explicit exclusions prevent scope creep into editor and billing features that would delay the first demo by months.

## Consequences

### Positive

- Team can say "no" to out-of-scope requests with ADR backing
- Timeline schema stays simple (v1, cut-only)
- Media worker remains deterministic and testable

### Negative

- MVP will not compete feature-for-feature with VidRush on editor or thumbnails
- English-only limits initial market

### Success criteria for MVP

1. User creates documentary project from prompt
2. User approves quote
3. Pipeline completes without manual intervention
4. User downloads 1080p MP4
5. User can close browser and return to completed project
6. Listicle and script-first paths work with same pipeline

## Related

- [../architecture/overview.md](../architecture/overview.md)
- [../architecture/pipeline-stages.md](../architecture/pipeline-stages.md)
- [0001-monorepo-and-temporal.md](./0001-monorepo-and-temporal.md)
- [0002-quote-approval-gate.md](./0002-quote-approval-gate.md)
