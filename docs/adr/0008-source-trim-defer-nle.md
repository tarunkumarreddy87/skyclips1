# ADR 0008: Source In-Point Trim (MVP) + Defer Ripple/Multi-Select

## Status

Accepted

## Date

2026-07-13

## Context

Timeline left-handle “trim” previously only shortened the clip on the timeline while preview/export still read media from `t=0`, which felt broken for real video/narration assets. Users also asked for CapCut-like ripple edit and multi-select.

ADR 0003 keeps **full timeline editor / NLE** out of MVP. We need a narrow, FFmpeg-native trim that preserves documentary export honesty without shipping ripple/multi-select.

## Decision

### In scope (MVP override of “trim is fake”)

- Optional `source_start_sec` on timeline.v1 `videoClip`, `brollClip`, `audioClip`, and `musicClip`
- Editor stores `sourceStartMs` on video/b-roll/narration/music items
- Left-edge trim adjusts timeline start **and** source in-point; right-edge trim adjusts duration only
- Preview seeks to `sourceStartMs + (playhead − clipStart)`
- Media worker uses FFmpeg `-ss` (video) / `atrim` offset (audio) before duration cut

### Dual-clip transition scrub (preview only)

- While playhead is inside an enabled transition window, preview may layer outgoing + incoming clips with CSS (fade/wipe/slide families)
- Not a frame-accurate xfade substitute; export remains FFmpeg `xfade`

### Explicitly deferred (needs later ADR / post-MVP)

- Ripple delete / ripple trim
- Multi-select, group move, slip tool as a first-class mode
- Magnetic timeline, nested sequences, linked AV pairs

## Consequences

- Trim finally matches export for A-roll and narration without Remotion
- Schema remains additive/optional — older manifests validate as `source_start_sec` omitted (= 0)
- NLE-grade editing stays out of MVP with a clear refusal path
