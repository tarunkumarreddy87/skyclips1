# Data Model

## Entity relationship overview

```
User
 └── Project (1:N)
      ├── Brief (1:1)
      ├── Quote (1:N, latest is active)
      ├── GenerationRun (1:N)
      │    └── ProgressEvent (1:N)
      └── Artifact (1:N)
```

## Entities

### User

Represents an authenticated account. MVP may use a managed auth provider (Clerk/Auth0) with `external_id` as the stable key.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `external_id` | string | Auth provider subject |
| `email` | string | Optional, from provider |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Project

Top-level container for a video generation request.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `title` | string | User-facing or inferred |
| `status` | enum | See state machine below |
| `entry_path` | enum | `prompt_first` \| `script_first` |
| `format_mode` | enum | `documentary` \| `listicle` |
| `workflow_id` | string | Temporal workflow ID, set on start |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Brief

Input content for the project. One brief per project.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → Project, unique |
| `prompt_text` | text | Topic/description (prompt-first) |
| `script_text` | text | Inline script (script-first) |
| `script_s3_key` | string | Uploaded script file |
| `voiceover_s3_key` | string | Custom voiceover upload (post-MVP slice) |
| `target_duration_sec` | int | Estimated or user-specified |
| `language` | string | Default `en` for MVP |
| `created_at` | timestamp | |

### Quote

Structured plan shown to the user before generation. Multiple versions allowed; one is `active`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → Project |
| `version` | int | Incrementing |
| `is_active` | bool | Latest approved or pending quote |
| `format_mode` | enum | `documentary` \| `listicle` |
| `duration_sec` | int | Estimated output duration |
| `language` | string | |
| `voice_id` | string | TTS voice identifier |
| `section_outline` | JSONB | Array of `{ title, summary }` |
| `credit_estimate` | int | Informational only (no billing in MVP) |
| `resolution` | string | Fixed `1920x1080` in MVP |
| `aspect_ratio` | string | Fixed `16:9` in MVP |
| `status` | enum | `draft` \| `pending_approval` \| `approved` \| `superseded` |
| `approved_at` | timestamp | Set on user approval |
| `created_at` | timestamp | |

### GenerationRun

One execution of the pipeline after quote approval.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → Project |
| `quote_id` | UUID | FK → Quote (approved version) |
| `temporal_run_id` | string | Temporal run identifier |
| `status` | enum | `queued` \| `running` \| `completed` \| `failed` \| `cancelled` |
| `current_stage` | string | Latest pipeline stage name |
| `error_message` | text | Set on failure |
| `started_at` | timestamp | |
| `completed_at` | timestamp | |

### ProgressEvent

Append-only log of stage transitions for UI and debugging.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `run_id` | UUID | FK → GenerationRun |
| `stage` | string | Pipeline stage identifier |
| `status` | enum | `started` \| `completed` \| `failed` |
| `percent` | int | 0–100, optional |
| `message` | string | Human-readable label |
| `artifact_id` | UUID | FK → Artifact, optional |
| `created_at` | timestamp | |

### Artifact

Pointer to an object stored in S3.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK → Project |
| `run_id` | UUID | FK → GenerationRun, optional |
| `type` | enum | See artifact types below |
| `s3_bucket` | string | |
| `s3_key` | string | |
| `content_type` | string | MIME type |
| `size_bytes` | bigint | |
| `metadata` | JSONB | Stage-specific metadata |
| `created_at` | timestamp | |

## Project state machine

```
draft
  → quoted          (quote generated)
  → approved        (user approved active quote)
  → queued          (workflow start requested)
  → running         (workflow executing)
  → completed       (final MP4 available)
  → failed          (unrecoverable error)

approved → draft    (user edits brief and re-quotes; supersedes prior quote)
running  → failed   (activity exhausted retries)
```

### Transition rules

| From | To | Trigger |
|------|----|---------|
| `draft` | `quoted` | Quote generated successfully |
| `quoted` | `approved` | User approves active quote |
| `quoted` | `draft` | User edits brief (quote superseded) |
| `approved` | `queued` | API starts Temporal workflow |
| `queued` | `running` | Workflow begins execution |
| `running` | `completed` | Render activity succeeds |
| `running` | `failed` | Any activity fails after retries |

**Hard rule:** Workflow start is only permitted when `project.status = approved` and no active run is `running`.

## Artifact types

| Type | S3 path pattern | Producer |
|------|-----------------|----------|
| `research` | `projects/{id}/runs/{run_id}/research.json` | Research activity |
| `script` | `projects/{id}/runs/{run_id}/script.json` | Script / ParseScript activity |
| `narration` | `projects/{id}/runs/{run_id}/narration.wav` | Voice activity |
| `narration_segment` | `projects/{id}/runs/{run_id}/audio/{section_id}.wav` | Voice activity |
| `scenes` | `projects/{id}/runs/{run_id}/scenes.json` | Scene plan activity |
| `scene_asset` | `projects/{id}/runs/{run_id}/assets/{scene_id}.*` | Scene plan activity |
| `timeline` | `projects/{id}/runs/{run_id}/timeline.v1.json` | Build timeline activity |
| `final_video` | `projects/{id}/runs/{run_id}/final.mp4` | Media worker |

## Script JSON structure (intermediate)

Stored as `script.json` artifact. Consumed by voice and scene planning activities.

```json
{
  "format_mode": "documentary",
  "language": "en",
  "sections": [
    {
      "id": "intro",
      "title": "Introduction",
      "narration": "Full narration text for this section.",
      "estimated_duration_sec": null
    }
  ]
}
```

After voice generation, `actual_duration_sec` is populated per section from TTS output.

## Scenes JSON structure (intermediate)

```json
{
  "scenes": [
    {
      "id": "scene-1",
      "section_id": "intro",
      "visual_intent": "Aerial view of the subject location",
      "asset_ref": {
        "type": "stock_image",
        "url": "https://...",
        "s3_key": "projects/.../assets/scene-1.jpg",
        "license": "pexels"
      },
      "duration_sec": 12.4
    }
  ]
}
```

## Indexes (recommended)

- `projects(user_id, created_at DESC)`
- `quotes(project_id, is_active)`
- `generation_runs(project_id, status)`
- `progress_events(run_id, created_at)`
- `artifacts(project_id, type)`

## Related documents

- [pipeline-stages.md](./pipeline-stages.md)
- [timeline-manifest.md](./timeline-manifest.md)
- [../adr/0002-quote-approval-gate.md](../adr/0002-quote-approval-gate.md)
