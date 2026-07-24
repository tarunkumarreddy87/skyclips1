# Timeline Manifest

## Purpose

The timeline manifest (`timeline.v1.json`) is the **sole input** to the media worker. It is the contract between the orchestrator (scene planning + timeline build) and the FFmpeg render pipeline. Changes to this schema require a version bump and ADR.

## Schema location

Canonical JSON Schema: `packages/timeline-schema/schema/timeline.v1.json`

## Design principles

1. **Renderer-only input** — Media worker reads manifest + referenced S3 assets. No LLM calls.
2. **Actual timings** — All `duration_sec` values come from TTS output, not text estimates.
3. **MVP simplicity** — Hard cuts only; no transitions, motion graphics, or multi-layer compositing.
4. **Fixed output** — 1920×1080, 16:9, H.264 + AAC.

## Top-level structure

```json
{
  "version": "1",
  "metadata": {
    "project_id": "uuid",
    "run_id": "uuid",
    "format_mode": "documentary",
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "duration_sec": 124.5
  },
  "tracks": {
    "video": [],
    "audio": [],
    "captions": []
  }
}
```

## Video track clips

Each clip represents a full-screen visual for a time range.

```json
{
  "id": "clip-1",
  "scene_id": "scene-1",
  "type": "image",
  "src": "s3://bucket/projects/{project_id}/runs/{run_id}/assets/scene-1.jpg",
  "start_sec": 0.0,
  "duration_sec": 12.4,
  "fit": "cover"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique clip identifier |
| `scene_id` | yes | Reference to scenes.json entry |
| `type` | yes | `image` or `video` (MVP: primarily `image`) |
| `src` | yes | S3 URI or key resolvable by media worker |
| `start_sec` | yes | Start time on timeline |
| `duration_sec` | yes | Clip duration (from voice segment) |
| `fit` | no | `cover` (default) or `contain` |

Clips must not overlap on the video track in MVP. Gaps are not permitted — every frame must have a visual.

## Audio track clips

```json
{
  "id": "audio-narration",
  "type": "narration",
  "src": "s3://bucket/projects/{project_id}/runs/{run_id}/narration.wav",
  "start_sec": 0.0,
  "duration_sec": 124.5,
  "volume": 1.0
}
```

MVP: single narration track. Background music is post-MVP.

## Captions track (optional in MVP)

```json
{
  "id": "caption-1",
  "section_id": "intro",
  "text": "Narration text for this section",
  "start_sec": 0.0,
  "duration_sec": 12.4
}
```

Captions may be burned in during render or deferred. MVP vertical slice may omit captions initially; schema supports them for forward compatibility.

## Validation rules

1. `version` must be `"1"`.
2. `metadata.resolution` must be exactly 1920×1080.
3. `metadata.fps` must be 30.
4. Video clips must cover `[0, metadata.duration_sec)` with no gaps.
5. Sum of non-overlapping video clip durations must equal `metadata.duration_sec`.
6. All `src` paths must reference objects that exist in S3 before render starts.
7. `duration_sec` on each clip must be > 0.

## Documentary example (minimal)

```json
{
  "version": "1",
  "metadata": {
    "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "run_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "format_mode": "documentary",
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "duration_sec": 36.0
  },
  "tracks": {
    "video": [
      {
        "id": "clip-1",
        "scene_id": "scene-1",
        "type": "image",
        "src": "projects/a1b2/.../assets/scene-1.jpg",
        "start_sec": 0.0,
        "duration_sec": 12.0,
        "fit": "cover"
      },
      {
        "id": "clip-2",
        "scene_id": "scene-2",
        "type": "image",
        "src": "projects/a1b2/.../assets/scene-2.jpg",
        "start_sec": 12.0,
        "duration_sec": 12.0,
        "fit": "cover"
      },
      {
        "id": "clip-3",
        "scene_id": "scene-3",
        "type": "image",
        "src": "projects/a1b2/.../assets/scene-3.jpg",
        "start_sec": 24.0,
        "duration_sec": 12.0,
        "fit": "cover"
      }
    ],
    "audio": [
      {
        "id": "audio-narration",
        "type": "narration",
        "src": "projects/a1b2/.../narration.wav",
        "start_sec": 0.0,
        "duration_sec": 36.0,
        "volume": 1.0
      }
    ],
    "captions": []
  }
}
```

## Listicle differences

Same schema. Scene planning produces one clip per list item (or per item segment). `format_mode` in metadata is `listicle`. No schema changes required.

## FFmpeg render expectations

The media worker translates the manifest into an FFmpeg filter graph:

1. Scale each image to 1920×1080 (cover crop).
2. Concatenate video segments with hard cuts.
3. Mux narration audio.
4. Encode H.264 (`libx264`) + AAC.
5. Output `final.mp4`.

Render worker must reject manifests that fail validation before invoking FFmpeg.

## Versioning policy

| Change type | Action |
|-------------|--------|
| Add optional field | Allowed in v1 if renderer ignores unknown fields |
| Change required field or semantics | Bump to `timeline.v2.json` + new schema file |
| Change output resolution | New version (MVP locks 1080p in v1) |

## Related documents

- [pipeline-stages.md](./pipeline-stages.md)
- [data-model.md](./data-model.md)
- `packages/timeline-schema/` (implementation, not yet scaffolded)
