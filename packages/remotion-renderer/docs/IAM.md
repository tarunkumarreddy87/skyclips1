# Remotion Lambda IAM (minimal / Remotion-generated)

Remotion ships the **exact** policies needed via CLI. Do not hand-widen them.

## Generate (authoritative)

```bash
cd packages/remotion-renderer
pnpm exec remotion lambda policies role    # → attach to role name remotion-lambda-role
pnpm exec remotion lambda policies user    # → attach as inline policy on remotion-user
pnpm exec remotion lambda policies validate
```

## Required pieces (summary)

| Principal | Purpose |
|-----------|---------|
| **Role** `remotion-lambda-role` | Assumed by Lambda. Needs S3 R/W on Remotion buckets, CloudWatch logs, Lambda self-invoke for chunking/stitch. |
| **User** (e.g. `remotion-user`) | Used by deploy/render CLI (`REMOTION_AWS_*`). Needs deploy function/site, invoke, S3, IAM pass-role limited to remotion role. |

Naming matters: Remotion docs require the role to be named **`remotion-lambda-role`** and the role policy **`remotion-lambda-policy`**.

## Credentials in HANUMAN

```env
REMOTION_AWS_ACCESS_KEY_ID=
REMOTION_AWS_SECRET_ACCESS_KEY=
REMOTION_AWS_REGION=us-east-1
REMOTION_SITE_NAME=hanuman-timeline
REMOTION_FRAMES_PER_LAMBDA=120
# After deploy:
REMOTION_FUNCTION_NAME=
REMOTION_SERVE_URL=
REMOTION_BUCKET_NAME=
```

**Do not** reuse MinIO `S3_*` keys for Remotion Lambda — Lambda runs on real AWS S3.

Local MinIO remains AutoVid artifact store until Phase 3 copies/proxies Lambda output into `hanuman-artifacts`.

## Over-granting to avoid

- Do not attach `AdministratorAccess` to the Remotion user.
- Do not open `s3:*` on `*` beyond Remotion’s generated policy.
- Do not expose `REMOTION_AWS_*` to the browser / Next.js public bundle — call `renderMediaOnLambda` only from workers/API.

## Quotas

```bash
pnpm exec remotion lambda quotas
```

New accounts may be limited to **10–50** concurrent Lambdas — raise the concurrency quota before 10‑minute parallel renders.
