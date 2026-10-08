# HANUMAN video engine

The owned runtime evaluates authored timeline timestamps directly. The browser previews source media with native video elements; both preview and cloud export use `renderGraphicsFrame` for captions, typography, photo frames, shapes, data-driven charts, retained motion overlay types, and declarative generated scenes. Export rasterizes its transparent SVG using the bundled fonts and embeds frame assets through `resolveAsset`.

`evaluateMediaFrame` defines absolute clip timing and before-boundary transition handles. Transitions never shorten the timeline. The incoming source holds its first frame during the outgoing tail, then begins playback at its authored start.

```ts
import { renderGraphicsFrame, evaluateMediaFrame } from "@hanuman/video-engine";
const svg = renderGraphicsFrame(manifest, frame / manifest.metadata.fps);
const media = evaluateMediaFrame(manifest, frame / manifest.metadata.fps);
```

Graphics keyframes use local seconds and positions in frame percentages. Caption word clocks use absolute seconds. Long caption cues page without truncating words; overlap chooses the shortest current cue. Fonts are distributed with their OFL licenses. Custom uploaded fonts require their font asset to be persisted and made available to the cloud rasterizer.

`renderTemplateFrame(template, localSec, durationSec, {phase})` renders documentary layouts as SVG, including title/closing, definition/profile/article, positive and negative charts, timelines, connections, and comparisons. `phase` separates the background plate from foreground typography so footage can sit between them. `evaluateTemplateMediaSlot` returns the same logical 1920×1080 footprint, entrance timing and saved layer offsets/scales used by the browser. Cloud compositing should place template foregrounds into their own clip before transitions and b-roll; a global foreground pass does not reproduce that layer ordering. `renderTemplateBackground` provides a static settled plate; animated plates require timestamp sampling.

Generated scene layers accept data and keyframes only. `renderMotionScene` supports text, counters, images, rectangles, ellipses and lines with independent channel sampling, easing, reveal masks and shadows. Existing documentary layer IDs remain stable for selection, persisted edits, resizing and deletion. The React compatibility wrapper is exported separately from `@hanuman/video-engine/preview`; the Node entry does not load React.

`timelineAudioCues` returns the shared absolute sound plan for transitions, generated scenes, documentary templates and authored template cues. It cuts sounds at scene boundaries, retains the six-second ambient asset, respects transition mute and manual SFX overlap, and suppresses overlapping automatic transition accents. Cue gains exclude the global SFX bus volume, which each transport applies once. Browser voices use the existing idempotent HTML audio transport and obey pause, seeking, playback speed, preview mute and the narration buffering gate.

Uploaded arbitrary HTML/CSS/JavaScript templates are **unsupported** by the native SVG runtime. `templateCapabilities` exposes this limitation, and the compatibility preview shows a safe documentary fallback with an explicit error message. Scripts and uploaded markup are never executed or silently advertised as equivalent. Convert uploads to declarative `MotionScene` layers for native preview/export parity. Colored drop shadows approximate the retained chromatic effect; they do not implement true RGB channel separation. Native footage effect parity depends on the FFmpeg compositor, independently of the shared SVG scene renderer.

Run `pnpm --filter @hanuman/video-engine test` and `typecheck`. Speed, GPU throughput, and visual parity require deployment benchmarks; this package does not make a measured performance claim.
