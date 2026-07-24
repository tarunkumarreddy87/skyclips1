# Animation / Transition Library (Phases 1–4)

## Delivered

### Phase 1 — Transitions
- Richer **film-burn** (flicker, vignette, scanlines, scratch)
- Custom **zoom** scale-crossfade (`transitions/zoom.tsx`)
- Custom **pixelize** mosaic approx (`transitions/pixelize.tsx`)
- Map updated in `transitions/map.ts` + `TRANSITION_MAPPING.md`
- Duration still from `duration_sec` → `secToFrames` only

### Phase 2 — Animations
- Module `src/animations/` with `presets.ts` + **`ApplyAnimation` / `useApplyAnimation`**
- Full **In** and **Out** maps for every schema preset (fade, float, zoom_*, ken_burns_*, drop, slide, wipe, pop, bounce, spin, slide_bounce)
- Loops: pulse, ken_burns, float

### Phase 3 — Overlays
- `SubscribeCtaOverlay` — pill CTA + default pop/pulse
- `ChapterTitleOverlay` — chapter vs **lower-third** styling (`y > 65` or variant)
- Editor export: `lower-third` preset → `chapter_title` with bottom placement (`build-timeline-manifest.ts`)

### Phase 4 — Assembly
- `AnimatedMediaClip` / captions / overlays use `ApplyAnimation`
- `transitionSeriesDurationFrames()` for composition length under xfade
- Fixture covers film-burn, zoom, CTA, lower-third, In/Out/loop

## Proof

`packages/remotion-renderer/proofs/library-proof.mp4` (also `out/library-proof.mp4`)

```bash
cd packages/remotion-renderer
pnpm exec tsx src/bridge/job.ts --job=out/lib-job.json
```

## Not done (Phase 5)

Full **E2E Indian Fighters** 7+ min project through `RENDER_ENGINE=remotion-local` still required for acceptance (needs real assets + media worker env).
