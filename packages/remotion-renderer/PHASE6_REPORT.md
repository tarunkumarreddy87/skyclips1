# Phase 6 — UI Render path (Indian Fighters) — IN PROGRESS

## Product alignment ([VidRush docs](https://docs.vidrush.ai/docs))

VidRush flow: brief → quote → generate → **editor polish → render**. HANUMAN editor now:

- Always exports with **Remotion** (`RENDER_ENGINE=remotion-local`, `RENDER_FFMPEG_FALLBACK=false`)
- Copy frames Remotion as SSOT (preview CSS-approximate)
- **Fidelity (2026-07-14):** Remotion now applies theme visual grade, narration/music/sfx bus volumes + fade in/out, and remaps captions/b-roll/overlays/audio onto the TransitionSeries export clock (same overlap math as `estimateExportDurationMs`)

## Acceptance path

Same as editor **Render video** button:

`POST /projects/{id}/render` with live `timelineManifest` → Temporal `VideoRenderWorkflow` → media `render_video` → Remotion bridge → `final_video` artifact.

Script: `scripts/phase6_ui_render.py`  
Project: `1fbee2bc-1a33-4518-847c-d54665285d9d` (Indian Fighters)  
Run: `c1e737d5-827f-492b-a8b6-870a6e7f04fe`  
Workflow: `video-render-c1e737d5-827f-492b-a8b6-870a6e7f04fe`

## Manifest

| Track | Count |
|-------|------:|
| video | 25 |
| audio | 1 |
| transitions | 7 |
| overlays | 24 |

## Proof artifact (when complete)

`packages/remotion-renderer/proofs/phase6-indian-fighters-ui-render.mp4`

## Status

**RUNNING — clean retry after worker crash**

Prior run `c1e737d5-…` failed (media/orch shells exited mid-encode → heartbeat timeout).  
Restarted **one** orch + **one** media via `scripts/run_*.bat` (detatched).

| Field | Value |
|-------|-------|
| New run | `7e0e21d3-8390-4bcb-bbbe-9b628dec0f0a` |
| Workflow | `video-render-7e0e21d3-…` |
| Engine | Remotion-only (`RENDER_FFMPEG_FALLBACK=false`) |
| Poller | `scripts/phase6_poll_stdout.py` |
| Launchers | `scripts/run_media.bat`, `scripts/run_orchestrator.bat` |

Proof when PASS: `packages/remotion-renderer/proofs/phase6-indian-fighters-ui-render.mp4`
