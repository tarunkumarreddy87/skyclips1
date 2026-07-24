# ADR 0006: Social publish & scheduling

## Status

Proposed

## Date

2026-07-12

## Context

Creators want to publish finished HANUMAN videos to YouTube, Facebook, and other networks on a schedule, with Google account connect. ADR 0003 lists YouTube publish as **out of scope for MVP**.

## Decision

Defer live social publishing and OAuth connect to a **post-MVP** milestone.

### In scope later (post-MVP)

| Area | Notes |
|------|--------|
| Google OAuth (YouTube) | Managed auth provider; store refresh tokens server-side only |
| Meta / Facebook / Instagram | Separate OAuth apps and page/asset permissions |
| Schedule queue | Worker that posts at `scheduled_at` from S3 `final_video` |
| Per-platform captions / titles | Mapped from project brief + user overrides |

### Explicitly not in MVP

- Real API calls to YouTube / Facebook / TikTok / etc.
- Credit charging for publishes
- Auto-connect without a reviewed OAuth security design

### Interim UX (this repo)

Ship a **Publish & schedule** page under `/projects/[id]/publish` that:

1. Links from the rendered video page
2. Shows platform cards and a schedule form
3. Clearly labels actions as **Coming soon (post-MVP)**
4. Does **not** call external social APIs or store OAuth secrets

## Consequences

- MVP stays focused on generate → edit → render → download
- Product can demo the publish destination without shipping insecure half-OAuth
- Implementing live publish requires a follow-up ADR covering token vault, scopes, and worker jobs
