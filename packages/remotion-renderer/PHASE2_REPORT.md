# Phase 2 — Remotion Lambda (setup + estimates)

## Status

Code + docs ready under `packages/remotion-renderer`. Live deploy requires:

1. IAM role/user from [IAM.md](./docs/IAM.md)
2. `REMOTION_AWS_ACCESS_KEY_ID` / `REMOTION_AWS_SECRET_ACCESS_KEY` in env
3. `pnpm lambda:deploy` then `pnpm lambda:render`

## Commands

```bash
cd packages/remotion-renderer
pnpm lambda:policies      # print role + user JSON
pnpm lambda:estimate      # 10-min cost model
pnpm lambda:quotas        # AWS concurrency limit
pnpm lambda:deploy        # function + site
pnpm lambda:render -- --props=fixtures/phase1-proof.props.json
```

## Concurrency / chunk size (~10 min)

| Setting | Value | Rationale |
|---------|-------|-----------|
| `framesPerLambda` | **120** default (`suggestedFramesPerLambda` for 600s → ~120) | ~150 Lambdas for 18 000 frames; under Remotion’s ~200 concurrent guidance |
| Function memory | 2048 MB | Remotion default |
| Timeout | 120 s | Per chunk |
| Privacy | `private` objects | Copy into AutoVid bucket in Phase 3 |

Override: `REMOTION_FRAMES_PER_LAMBDA=180` if account concurrency is low.

## Cost model (10 min 1080p)

| Source | Estimate |
|--------|----------|
| Remotion published (10 min remote HD, simple composition) | **~$0.10–0.11** cold/warm |
| HANUMAN timeline (transitions + captions + overlays + broll) | **Budget $0.15–0.45** until measured |
| Not included in Lambda GB-s | S3 storage/egress, CloudWatch, Remotion license (teams 4+) |

Run `pnpm lambda:estimate` for `estimatePrice()` with current `framesPerLambda`.

## Pause before Phase 3

Do not wire Temporal until:

1. IAM role `remotion-lambda-role` + user policy applied (see [docs/IAM.md](./docs/IAM.md))
2. `REMOTION_AWS_*` keys configured
3. `pnpm lambda:deploy` succeeds
4. A fixture render via `pnpm lambda:render` records real `costs.accruedSoFar`

### Deploy attempt (2026-07-14)

AWS caller `claudecodes` was available via `aws configure export-credentials`, but S3 `CreateBucket` returned **AccessDenied** — the identity lacks Remotion Lambda IAM (expected until policies from `docs/iam-*-policy.json` are attached). Deploy scripts are ready; cloud deploy blocked on IAM, not code.
