# ADR 0010: Brand Profiles (MVP override)

## Status

Accepted

## Date

2026-07-15

## Context

[ADR 0003](./0003-mvp-scope.md) deferred “Source blacklisting / brand profiles” to post-MVP. Product direction now requires VidRush-aligned house-style defaults (voice, theme, language, visuals, compliance) selectable from the studio prompt bar, matching [VidRush Brand Profiles](https://docs.vidrush.ai/docs/brand-profiles).

## Decision

Ship Brand Profiles in the web app as a client workspace store (localStorage) for MVP:

- Max 10 profiles per workspace; creating an 11th drops the oldest
- Unique names ≤ 100 characters
- Four tabs: Overview, Voiceover, Creative Assets, Compliance
- Active profile drives create/quote defaults (theme → `brandProfileId` for `resolveThemeId`, voice, language, duration, format)

Server-side persistence and multi-user workspace sharing are deferred; the UI contract matches VidRush so a later API-backed store can replace localStorage without redesigning the surface.

## Consequences

- MVP ADR out-of-scope item is intentionally overridden for this feature
- Compliance/blocklist settings are stored and surfaced in UI; orchestrator enforcement lands with a follow-up when sourcing/blocklists are wired in workers
