# @hanuman/remotion-renderer

Local Remotion composition that consumes **timeline.v1** (ADR 0009).

## Commands

```bash
cd packages/remotion-renderer
pnpm install   # from monorepo root preferred: pnpm install
pnpm render:proof
pnpm studio
pnpm lambda:estimate
pnpm lambda:deploy    # needs REMOTION_AWS_* + IAM (see docs/IAM.md)
pnpm lambda:render -- --props=fixtures/phase1-proof.props.json
```

Output: `out/phase1-proof.mp4` (local) or S3 URL (Lambda)

## Timing SSOT

`src/lib/timing.ts` — `secToFrames` / `clipFromFrame` from absolute `start_sec` + `duration_sec`. No relative MasterTimeline.

## Transition mapping

See [TRANSITION_MAPPING.md](./TRANSITION_MAPPING.md).
