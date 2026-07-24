# ADR 0002: Quote Approval Gate

## Status

Accepted

## Date

2026-07-06

## Context

AI video generation is expensive in time and API cost. Users may submit ambiguous prompts that produce unexpected format, duration, or voice choices. VidRush and similar platforms show a "quote statement" before generation so users can confirm or adjust the plan.

We need a first-class gate between project creation and pipeline execution.

## Decision

Introduce **Quote** as a domain entity with an explicit approval step. No Temporal workflow may start until:

1. An active quote exists with `status = approved`
2. The parent project has `status = approved`
3. No other run is in `running` state for the project

### Quote contents (MVP)

- Format mode (`documentary` | `listicle`)
- Estimated duration (seconds)
- Language (default `en`)
- Voice ID
- Section outline preview
- Credit estimate (informational only — no billing in MVP)
- Fixed resolution `1920x1080` and aspect ratio `16:9`

### User flow

```
Create project → Generate quote → User reviews/edits → Approve → Start workflow
```

If the user edits the brief after quoting, the active quote is superseded and the project returns to `draft` or `quoted`.

## Rationale

**Cost control:** Prevents accidental 30-minute generation runs from typos or wrong format detection.

**User trust:** Surfaces how the system interpreted the brief before irreversible work begins.

**Stable workflow input:** The approved quote is snapshotted into `GenerationRun` so mid-flight brief edits do not affect an active run.

**Modularity:** Quote generation is an API concern (fast, synchronous or short LLM call). Generation is a workflow concern (long, async). Clean separation.

## Consequences

### Positive

- Clear API boundary: `POST /projects/{id}/approve` is the only workflow trigger
- Quote versions provide audit trail
- UI has a natural review screen before the progress stepper

### Negative

- Extra step in UX (intentional friction)
- Quote inference must be good enough that users rarely need heavy editing

### Implementation notes

- Quote generation may use a lightweight LLM call or rule-based inference in early phases
- `credit_estimate` is displayed but not enforced until billing ADR exists
- API must reject `POST /projects/{id}/generate` (or equivalent) without approved quote

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Generate immediately on project create | High cost risk; poor UX for wrong interpretations |
| Soft confirmation modal only | No structured plan to edit; no snapshot for workflow |
| Post-hoc cancellation | Wastes API spend; harder to implement partial compensation |

## Related

- [../architecture/data-model.md](../architecture/data-model.md)
- [0003-mvp-scope.md](./0003-mvp-scope.md)
