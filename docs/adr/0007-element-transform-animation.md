# ADR 0007: Element transform + animation / transition system

## Status

Accepted (product override of ADR 0003 “advanced motion graphics”)

## Date

2026-07-13

## Context

ADR 0003 lists advanced motion graphics as post-MVP. ADR 0005 limited the motion lane to template overlays (Subscribe CTA, chapter titles). Product wants Canva/Vidrush-style **canvas transform** (move / resize / rotate) and **In / Out / Loop / Zoom** animation presets plus expanded clip-boundary transitions. Schema work (this ADR) originally targeted FFmpeg-native filters; **export compositing is superseded by [ADR 0012](./0012-native-video-engine.md)** (owned video engine). Schema fields remain the SSOT.

Phase 0 confirmed: timeline.v1 clips have no `transform`/`animation`; `toAbsoluteTimeline` does not exist (timing is already absolute); local FFmpeg exposes `xfade`, `zoompan`, `fade`, `overlay`, `rotate`.

## Decision

1. Extend **timeline.v1** (not a parallel MasterTimeline) with optional per-clip `transform` + `animation`, and expand `transitions[].type` to include FFmpeg `xfade` names while keeping legacy types (`zoom`, `slide-pan`, `film-burn`, `glitch`, …).
2. Only ship presets that have a planned FFmpeg mapping (Phase 5). UI must not expose presets the renderer cannot encode.
3. Themes (Crime / History / …) continue to supply **default transition preference + grade**; animation presets are **user-selectable per element**, not theme-locked.
4. Editor preview CSS approximations are feedback-only; acceptance requires rendered MP4 proof (Phase 6).

## Consequences

- Schema remains backward compatible: new fields are optional; existing fixtures validate unchanged.
- Media worker must gain zoompan / rotate / fade / overlay-expression paths before UI can be marked done.
- Supersedes the “template overlays only” ceiling of ADR 0005 for motion **when** Phase 5 ships; until then editor may store fields that render as no-ops only if explicitly documented as incomplete.

## Phase 6 proof

Acceptance artifact: `workers/media/proofs/motion-phase6.mp4` produced by
`workers/media/tests/test_motion_render_proof.py` (fade-in, ken-burns, scaled+rotated A-roll,
transformed B-roll inset, dissolve + wipeleft). Re-run:

```bash
cd workers/media && .venv/Scripts/python.exe -m pytest tests/test_motion_render_proof.py -q
```
