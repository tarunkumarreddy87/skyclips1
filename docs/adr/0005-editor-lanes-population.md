# ADR 0005: Editor Lanes Population (Captions, B-roll, Music, Motion)

## Status

Accepted (product override of ADR 0003 music deferral)

## Date

2026-07-11

## Context

Freshly generated projects showed caption overflow covering most of the preview frame, and Image / Motion / Music lanes stayed empty ("No image" / "No motion" / "No music"). Product asked to match **real Vidrush behavior** (docs.vidrush.ai), not marketing: template motion only, library music, narration-matched B-roll.

ADR 0003 listed background music as post-MVP. This ADR records an explicit override for a **library/template** music bed (not custom composition).

## Decision

1. **Captions** — Chunk section narration into subtitle-sized timed clips (≤2 lines); constrain editor preview and FFmpeg `drawtext` to lower-third safe margins.
2. **B-roll / Image lane** — Secondary Pexels fetch per section from spoken-content query; populate `tracks.broll[]`; FFmpeg full-frame overlay during mid-scene windows.
3. **Music lane** — Mood-tagged **synthesized** ambient beds (`hanuman-synth-beds-v1`) auto-selected from format/script keywords; volume via `settings.music_volume` / Audio Overlay slider; FFmpeg `amix` under narration. **Not** a licensed commercial library yet.
4. **Motion lane** — Template overlays only: Subscribe CTA (sign-off) + chapter titles (section starts after intro). No generative/custom motion graphics.

## Consequences

- Timeline.v1 schema gains optional `tracks.broll`, `tracks.music`, `settings`, and `chapter_title` overlay type.
- Existing projects need re-generation to populate empty lanes.
- **PRE-LAUNCH (not solved):** Music uses temporary synth beds (`hanuman-synth-beds-v1`). Product chose to keep synth beds for now. A real royalty-free / licensed library (Mixkit pack, Epidemic, Artlist, etc.) is still required before launch — do not treat synth beds as the shipping music solution. Track as an explicit pre-launch checklist item.
