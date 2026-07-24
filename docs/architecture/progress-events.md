# Progress Events

## Purpose

Progress events decouple long-running Temporal workflows from the UI. The orchestrator emits events during activity execution; the API persists them and fans out via SSE. The frontend never queries Temporal directly.

## Event envelope

```json
{
  "id": "uuid",
  "run_id": "uuid",
  "project_id": "uuid",
  "stage": "generate_voice",
  "status": "started",
  "percent": 35,
  "message": "Creating the voiceover",
  "artifact_id": null,
  "artifact_type": null,
  "timestamp": "2026-07-06T16:30:00.000Z"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | yes | Unique event ID |
| `run_id` | UUID | yes | Generation run |
| `project_id` | UUID | yes | Denormalized for SSE subscription |
| `stage` | string | yes | Pipeline stage identifier (snake_case) |
| `status` | enum | yes | `started` \| `completed` \| `failed` |
| `percent` | int | no | 0–100, UI hint only |
| `message` | string | yes | Human-readable label for UI |
| `artifact_id` | UUID | no | Set when stage produces an artifact |
| `artifact_type` | string | no | e.g. `script`, `narration`, `final_video` |
| `timestamp` | ISO 8601 | yes | Event creation time |

## Stage identifiers

| `stage` value | UI label |
|---------------|----------|
| `validate_brief` | Getting your content ready |
| `run_research` | Researching the topic |
| `generate_script` | Writing the script |
| `parse_script` | Processing your script |
| `generate_voice` | Creating the voiceover |
| `plan_scenes` | Planning visuals |
| `build_timeline` | Building timeline |
| `enqueue_render` | Rendering your video |

## Event lifecycle per stage

Each stage emits at minimum:

1. `{ stage, status: "started" }` — when activity begins
2. `{ stage, status: "completed", artifact_id, artifact_type }` — on success
3. `{ stage, status: "failed", message }` — on unrecoverable error

## Transport

### Write path

```
Activity → publish to Redis channel `progress:{project_id}`
         → API subscriber persists to progress_events table
         → API fans out to SSE clients subscribed to project
```

### Read path (API)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/projects/{id}/progress` | GET (SSE) | Stream events for active run |
| `/projects/{id}/runs/{run_id}/events` | GET | Historical events (polling fallback) |

### SSE format

```
event: progress
data: {"stage":"generate_voice","status":"started","percent":35,"message":"Creating the voiceover",...}

event: progress
data: {"stage":"generate_voice","status":"completed","percent":50,"artifact_type":"narration",...}
```

Send a heartbeat comment every 30s to keep connections alive:

```
: heartbeat
```

## UI consumption guidelines

1. **Stage stepper** — Derive current step from latest `started` event without matching `completed`.
2. **Progress bar** — Use `percent` as hint; jump to 100 only on `enqueue_render` completed.
3. **Failure** — On any `failed` event, show `message` and link to project detail.
4. **Reconnection** — On SSE reconnect, fetch historical events then resume stream.
5. **Completed run** — When `project.status = completed`, show download CTA; SSE may be closed.

## Run-level terminal events

When the workflow finishes, emit a final summary event:

```json
{
  "stage": "enqueue_render",
  "status": "completed",
  "percent": 100,
  "message": "Your video is ready",
  "artifact_type": "final_video",
  "artifact_id": "uuid"
}
```

On workflow failure:

```json
{
  "stage": "plan_scenes",
  "status": "failed",
  "percent": 50,
  "message": "Could not find suitable visuals for section 3"
}
```

## Idempotency

Events are append-only. Activities should not emit duplicate `completed` events for the same stage. Use `run_id + stage + status` deduplication in the activity if retries occur.

## Correlation

All events for a run share `run_id`. API requests and Temporal workflows should log `project_id`, `run_id`, and `workflow_id` together for traceability.

## Related documents

- [pipeline-stages.md](./pipeline-stages.md)
- [data-model.md](./data-model.md)
