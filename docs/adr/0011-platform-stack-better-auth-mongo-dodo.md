# ADR 0011: Platform stack — Better Auth, MongoDB Atlas, Dodo, Cloudflare

## Status

Accepted

## Date

2026-07-24

## Context

ADR 0003 specified a managed auth provider (Clerk/Auth0) and deferred billing. Product direction now requires:

| Concern | Choice |
|---------|--------|
| Auth | [Better Auth](https://www.better-auth.com/) (email/password; social later) |
| User + app data | MongoDB Atlas |
| Subscriptions | [Dodo Payments](https://docs.dodopayments.com/) |
| Object storage | AWS S3 (unchanged) |
| Video render | Owned video engine (ADR 0012) |
| Edge | Cloudflare (DNS, CDN, SSL, WAF) |

Clerk is removed. Billing becomes in-scope for subscription checkout (credit enforcement still incremental).

## Decision

### Auth (web)

- Better Auth on Next.js App Router (`apps/web`) with official MongoDB adapter.
- Session cookie; API identity via forwarded session / `X-User-External-Id` = Better Auth user id (until JWT middleware on FastAPI).
- Sign-in / sign-up pages replace Clerk catch-all routes.

### Data

**Phase 1 (this ADR):**

- MongoDB Atlas holds Better Auth collections (`user`, `session`, `account`, `verification`) and app collections for `subscriptions` / entitlements.
- Postgres + SQLAlchemy remain the store for the video pipeline (`projects`, `quotes`, `artifacts`, …) so Temporal/render stay stable.

**Phase 2 (follow-up ADR):**

- Migrate pipeline domain models from Postgres → Mongo (or dual-write), then retire Postgres.

### Payments

- Dodo Payments via `@dodopayments/nextjs`: checkout session, customer portal, webhooks.
- Webhook updates Mongo `subscriptions` and drives UI plan state (replaces Zustand-only preview).

### Edge

- Cloudflare in front of the public web origin (Vercel or ALB): DNS, proxied CDN, Universal SSL, WAF/bot basics.
- API may stay on ALB origin with Cloudflare proxied hostname or path routing; document in runbook.

### Out of this ADR

- Full credit metering enforcement
- Migrating Temporal activity persistence off Postgres
- Social OAuth providers (schema-ready via Better Auth)

## Consequences

### Positive

- No Clerk vendor lock-in; auth data owned in Atlas
- Real subscription path with Dodo
- Clear edge posture with Cloudflare

### Negative / risks

- Two databases during Phase 1 (Mongo + Postgres)
- FastAPI still stub-auth until session bridge is hardened
- Billing now in MVP surface area (overrides ADR 0003 “no billing”)

### Success criteria (Phase 1)

1. Clerk packages and routes gone; sign-up/sign-in via Better Auth
2. Auth users persist in MongoDB Atlas
3. Dodo checkout + webhook update subscription document
4. S3 retains artifacts; the owned render-service handles export
5. Cloudflare runbook published for DNS/SSL cutover
