# Phase 5 → Remotion-only product path (supersedes smart FFmpeg downgrade)

## Decision

Aligned with [VidRush workflow](https://docs.vidrush.ai/docs): brief → quote → generate → **editor polish → render**.

The video editor always exports with **Remotion**. Hard-cut timelines no longer drop to FFmpeg.

| `RENDER_ENGINE` | Behavior |
|-----------------|----------|
| `remotion-local` / `auto` | Always Remotion local |
| `remotion-lambda` | Always Remotion Lambda |
| `ffmpeg` | Ops force only |

`RENDER_FFMPEG_FALLBACK` product default: **false**.

## Verify

```bash
cd workers/media && python -m pytest tests/test_engine_select.py -q
```
