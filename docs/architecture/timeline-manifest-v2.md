# Timeline Manifest v2 — Design Document (Phase 4)

**Status:** Design only — not wired to orchestrator, media worker, API, or editor.  
**Canonical schema draft:** `packages/timeline-schema/schema/timeline.v2.json`  
**Supersedes for new projects:** `timeline.v1.json` (v1 remains valid for already-rendered projects)

---

## 1. Versioning strategy

### Principle

`timeline.v1.json` and `timeline.v2.json` are **immutable per run** once written to S3. The manifest is the render contract; the editor reads the latest manifest artifact for a project.

### Rules

| Rule | Detail |
|------|--------|
| **No backfill** | Existing S3 manifests stay `version: "1"` forever. Already-rendered videos are not re-opened as v2. |
| **New runs → v2** | After Phase 5+ ship, `build_timeline` writes `timeline.v2.json` (or same key with `version: "2"` — see naming below). |
| **Version switch** | Top-level `version` field: `"1"` \| `"2"`. Consumers branch on this field only. |
| **Artifact key** | Keep `timeline.v1.json` filename for v1 runs. New runs use `timeline.v2.json` (parallel artifact type `timeline`, content_type unchanged). Avoid overwriting v1 keys. |
| **API** | `GET /projects/{id}/timeline` returns manifest as stored; adds `mediaUrls` map. No server-side upgrade v1→v2. |
| **Editor** | `manifest-mapper.ts` dispatches: `v1` → existing mapper; `v2` → `mapTimelineV2ToEditorState()`. Unknown version → error with clear message. |
| **Media worker** | `validate_manifest()` selects schema by `version`. v1 path keeps current concat+mux pipeline. v2 path uses extended `ffmpeg_pipeline_v2.py` (or versioned branches in one module). |
| **Validator package** | `packages/timeline-schema`: add `timeline.v2.json`, `validateTimelineV2()`, fixtures per track type. CI validates both versions. |

### Editor / settings split

v1 manifests have **no** `settings` block (editor uses UI defaults). v2 adds optional `settings` for values that must round-trip to render (volumes, show_transitions, captions_enabled, background). Editor-only chrome (zoom, snap) stays client-side only.

### Migration path for users

1. User opens project with v1 manifest → editor works as today (video + narration only).
2. User triggers re-generation or “upgrade edit” (future product decision) → new run produces v2.
3. Re-render uses v2 manifest only.

**No automatic migration.** Product may later offer “duplicate project as editable v2” by re-running pipeline with v2 `build_timeline`.

---

## 2. Track shapes (v2 schema summary)

Full JSON Schema: `packages/timeline-schema/schema/timeline.v2.json`.

### Carried forward from v1 (unchanged semantics)

- **`tracks.video[]`** — Full-bleed base scene visuals (one clip per script section). Still must cover `[0, duration_sec)` with no gaps.
- **`tracks.audio[]`** — Extended: `type` enum adds `music`, `sfx` (narration remains required for documentary/listicle today).

### New or fixed tracks

| Track | Purpose | v1 state |
|-------|---------|----------|
| **`captions[]`** | Burned-in or soft captions | Schema exists; pipeline always emits `[]` |
| **`broll[]`** | Layered image/video over base video | Does not exist |
| **`text_overlays[]`** | Editable text (titles, CTAs) | Does not exist |
| **`music[]`** | Background music bed | Does not exist (docs: post-MVP) |
| **`sfx[]`** | One-shot sound effects | Does not exist |
| **`transitions[]`** | Between consecutive **video** clips | Editor-only mock |

### Key field additions

**Caption clip** — add optional `style` (font, position, shadow) for render; minimum v2 ships section-level text + timing.

**Broll clip** — `src`, `start_sec`, `duration_sec`, `layer` (`overlay` \| `replace`), `fit`, optional `position`/`scale` for PiP.

**Text overlay** — `text`, `start_sec`, `duration_sec`, `position` (normalized 0–100), `style` (font_size, color, weight, alignment, shadow).

**Music / SFX** — same shape as audio clips with `type`, `src`, `start_sec`, `duration_sec`, `volume`, optional `fade_in_sec` / `fade_out_sec`.

**Transition** — `after_clip_id` (video clip id), `type` (`cut` \| `fade` \| `slide` \| …), `duration_sec`, `enabled`.

**Settings (optional)** — `captions_enabled`, `show_transitions`, `narration_volume`, `music_volume`, `sfx_volume`, `background_color`.

---

## 3. Render consumer per track type (FFmpeg vs compositor)

**Historical proposal:** This rendering section is superseded by ADR 0012. Original stack: FFmpeg only (`workers/media/src/render/ffmpeg_pipeline.py`). **No owned SVG compositor** in `packages/`, `workers/`, or `apps/`. No BullMQ render manifests.

| Track | Render component | Feasibility | Notes |
|-------|------------------|-------------|-------|
| **video[]** | FFmpeg | ✅ Today | Per-clip scale+crop → concat (v1). v2: input to compositor stage. |
| **audio[narration]** | FFmpeg | ✅ Today | Mux with `-shortest` (v1). v2: keep as primary audio bus. |
| **captions[]** | FFmpeg `drawtext` / `subtitles` | ✅ Phase 5 | Section-level: one `drawtext` or ASS subtitle event per caption clip. **No word-level data in pipeline today** (see §4). |
| **music[]** | FFmpeg `amix` / `volume` / `afade` | ✅ Phase 6 | Mix music under narration with manifest volumes. Requires music `src` assets in S3. |
| **sfx[]** | FFmpeg `adelay` + `amix` | ✅ Phase 6 | Short clips at `start_sec`. Same asset gap as music. |
| **transitions[]** | FFmpeg `xfade` | ✅ Phase 7 (partial) | **fade**, **slide** between consecutive video segments via `xfade` filter chain. **zoom**, **blur**, **theme** are not native xfade types — need custom expressions or pre-rendered transition clips (**harder**, may defer to Phase 7b or map to fade). |
| **broll[]** | FFmpeg `overlay` | ⚠️ Phase 8 | **PiP / full-bleed overlay at timestamps:** `filter_complex` overlay on base video. **Multiple overlapping broll + complex z-order:** still FFmpeg-feasible but graph complexity grows. **Replace mode** (broll covers base for interval): overlay full-frame. Does **not** require owned SVG compositor for MVP broll. |
| **text_overlays[]** | FFmpeg `drawtext` **or** compositor | ⚠️ Phase 9 decision | **drawtext burn-in:** fast, matches “rendered output” for export, but text is **baked into pixels** — re-edit requires manifest change + re-render (acceptable for Vidrush-like “edit then re-render” if manifest is SSOT). **Compositor (owned SVG compositor/custom):** needed for live WYSIWYG preview = final pixel-perfect motion graphics, complex fonts, animations. **Recommendation:** Phase 9 ship **drawtext** for static text; defer motion/animation to Phase 10 or pre-rendered overlay videos on `broll[]`. |
| **animations[]** (Subscribe CTA, motion graphics) | Compositor **or** pre-rendered video on `broll[]` | ❌ FFmpeg alone | FFmpeg has no motion-graphics engine. **Options:** (1) Treat as **short MP4/WebM overlay** on `broll[]` (FFmpeg overlay) — ship subset in Phase 10; (2) Adopt **owned SVG compositor** (or similar) — large stack change. **Do not start Phase 10 without product priority.** |

### Proposed v2 render pipeline (single FFmpeg graph)

```
1. Build base video: video[] clips → [xfade chain] → base.mp4
2. Composite: broll[] + text_overlays[] (drawtext) + captions[] → composite.mp4
3. Audio: narration + music + sfx → amix → audio.aac
4. Mux composite + audio → final.mp4
```

Steps 2–3 can be one `filter_complex` invocation or staged files (easier to debug per phase).

---

## 4. Captions timing (Phase 5 input)

### What exists today

| Source | Timing data |
|--------|-------------|
| `script.json` `sections[].narration` | Text only |
| `generate_voice` (`pipeline.py:210-226`) | Per-section `actual_duration_sec` after TTS; stored back into `script.json` |
| `build_timeline` (`pipeline.py:374-392`) | Splits **total narration duration** across scenes proportionally to `scene.duration_sec` |
| Word-level timestamps | **None** — Sarvam TTS returns audio bytes only; no captioning worker |

### Phase 5 recommendation

**Section-level captions are acceptable for v2.0** (one caption block per script section, timed to match the corresponding **video clip** `start_sec` / `duration_sec`).

Implementation: in `build_timeline`, after computing each video clip’s `start_sec` and `duration_sec`, append a caption clip:

```json
{
  "id": "caption-{section_id}",
  "section_id": "{section_id}",
  "text": "{section.narration}",
  "start_sec": <same as scene clip>,
  "duration_sec": <same as scene clip>
}
```

Render: burn in via `drawtext` or generate ASS from `captions[]`.

### Word-level captions (future)

Requires one of:

- TTS provider word timestamps (Sarvam/API extension)
- Forced alignment (e.g. whisper on `narration.wav`)
- Dedicated captioning worker

**Out of scope for Phase 5** unless product requires karaoke-style captions before ship.

---

## 5. Music / SFX asset sources (Phase 6 input)

**Repo search:** No bundled royalty-free music/SFX library. Editor mock references `/editor-mock/music.mp3` (not in `apps/web/public`). Orchestrator has **Pexels photos only** (`workers/orchestrator/src/clients/pexels.py`).

Phase 6 needs:

1. **Curated asset pack** in S3 (e.g. `assets/library/music/`, `assets/library/sfx/`) **or**
2. Pipeline step to attach a default bed per `format_mode` **or**
3. User-uploaded music via editor → new upload API (Phase 3.3 item)

Default for first render proof: **ship 1–2 local CC0 files** in repo → uploaded to MinIO on worker init or referenced by fixed S3 keys in `build_timeline`.

---

## 6. Broll sourcing (Phase 8 input)

- **Primary source:** Reuse `plan_scenes` / Pexels (`search_photos`) for secondary visuals, or allow editor replace-media to pick stock URLs (already partial in web app).
- **Pipeline:** New optional `plan_broll` activity or extend `plan_scenes` to emit `broll[]` entries (e.g. one overlay per section at offset).
- **Not a new licensing integration** for MVP — Pexels is sufficient for proof.

---

## 7. Text overlays vs Vidrush editing model (Phase 9 input)

| Approach | Editable after generation? | Preview fidelity | Effort |
|----------|---------------------------|------------------|--------|
| **Manifest SSOT + drawtext re-render** | Yes — edit manifest in editor, re-render | Preview approximates (canvas CSS ≠ drawtext) | Medium |
| **Compositor (owned SVG compositor)** | Yes — preview = render | High | Large (new dependency, React render farm) |
| **Burn-in only, no manifest round-trip** | No | N/A | Small (not Vidrush parity) |

**Recommendation:** Manifest SSOT + FFmpeg `drawtext` for Phase 9. Editor canvas already edits `text_overlays[]` fields; preview uses CSS approximation; export uses render. Matches “edit then re-render” if users expect final pixel output from server render.

---

## 8. Editor mapping (v2 → existing UI)

No new lanes required — map manifest tracks to Phase 2 editor lanes:

| Manifest | Editor lane |
|----------|-------------|
| `captions[]` | `track-captions` |
| `text_overlays[]` | `track-text` |
| `video[]` | `track-video` |
| `broll[]` | `track-broll` |
| `audio[type=narration]` | `track-narration` |
| `music[]` | `track-music` |
| `sfx[]` | `track-sfx` |
| `transitions[]` | `timeline.transitions` (existing) |
| `animations[]` (if deferred) | `track-animation` — empty until Phase 10 |

`settings` in manifest → `timeline.settings` (volumes, show_transitions, captions_enabled).

---

## 9. Phase rollout map (implementation order)

| Phase | Track | Render proof required |
|-------|-------|------------------------|
| **5** | `captions[]` populated + burned in | Visible subtitle text on exported MP4 |
| **6** | `music[]` / `sfx[]` | Audible bed/SFX in MP4 |
| **7** | `transitions[]` | Visible fade/slide between scenes in MP4 |
| **8** | `broll[]` | Overlay visible in MP4 + IMAGE lane |
| **9** | `text_overlays[]` | Text burned in MP4 + TEXT lane |
| **10** | animations | **Blocked on priority** — prefer broll overlay video clips |

---

## 10. Open decisions (need product input)

1. **Caption style defaults** — single bottom-center template vs per-theme presets?
2. **Transition types in v2.0** — ship `fade` + `slide` only; map editor `zoom`/`blur`/`theme` to fade until compositor exists?
3. **Music default** — always add a bed in `build_timeline` or only when user adds in editor?
4. **Phase 10** — motion graphics as MP4 overlays vs owned SVG compositor investment?

---

## Related files

- v1 schema: `packages/timeline-schema/schema/timeline.v1.json`
- v2 schema draft: `packages/timeline-schema/schema/timeline.v2.json`
- Orchestrator timeline build: `workers/orchestrator/src/activities/pipeline.py:366-421`
- Media render: `workers/media/src/render/ffmpeg_pipeline.py`
- Editor types: `apps/web/src/lib/editor/types.ts`
- Editor manifest mapper: `apps/web/src/lib/editor/manifest-mapper.ts`
