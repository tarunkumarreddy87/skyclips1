/**
 * Phase 2: export duration estimate accounts for transition overlaps.
 * Run: cd packages/remotion-renderer && pnpm exec tsx ../../apps/web/src/lib/editor/export-duration.roundtrip.ts
 */
import assert from "node:assert/strict";
import { estimateExportDurationMs } from "./export-duration";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import type { EditorState, Timeline } from "./types";

function baseTimeline(overrides: Partial<Timeline> = {}): Timeline {
  return {
    id: "tl",
    fps: 30,
    durationMs: 10000,
    tracks: [
      {
        id: "v",
        type: "video",
        label: "V",
        locked: false,
        hidden: false,
        items: [
          {
            id: "c1",
            type: "video",
            startMs: 0,
            endMs: 5000,
            label: "1",
            mediaType: "image",
            assetId: "a1",
            fitMode: "cover",
            muted: true,
            hidden: false,
          },
          {
            id: "c2",
            type: "video",
            startMs: 5000,
            endMs: 10000,
            label: "2",
            mediaType: "image",
            assetId: "a2",
            fitMode: "cover",
            muted: true,
            hidden: false,
          },
        ],
      },
      { id: "n", type: "narration", label: "N", locked: false, hidden: false, items: [] },
      { id: "an", type: "animation", label: "A", locked: false, hidden: false, items: [] },
      { id: "b", type: "broll", label: "B", locked: false, hidden: false, items: [] },
      { id: "m", type: "music", label: "M", locked: false, hidden: false, items: [] },
      { id: "s", type: "sfx", label: "S", locked: false, hidden: false, items: [] },
      { id: "t", type: "text", label: "T", locked: false, hidden: false, items: [] },
      { id: "c", type: "captions", label: "C", locked: false, hidden: false, items: [] },
    ],
    transitions: [
      {
        id: "tr1",
        afterItemId: "c1",
        transitionType: "film-burn",
        durationMs: 500,
        enabled: true,
      },
    ],
    settings: {
      zoom: 1,
      snappingEnabled: true,
      showTransitions: true,
      captionsEnabled: true,
      captionStyle: "bold_static",
      backgroundColor: "#000",
      backgroundImage: null,
      overlayDropShadow: true,
      narrationVolume: 100,
      musicVolume: 35,
      sfxVolume: 50,
      clipAudioVolume: 0,
      themeId: "standard",
    },
    ...overrides,
  };
}

function main() {
  const withOverlap = baseTimeline();
  assert.equal(estimateExportDurationMs(withOverlap), 9500, "5s+5s-0.5s transition");

  const hardCuts = baseTimeline({
    settings: { ...withOverlap.settings, showTransitions: false },
  });
  assert.equal(estimateExportDurationMs(hardCuts), 10000, "showTransitions off → no overlap");

  const state: EditorState = {
    project: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "dur",
      status: "editing",
      format: "documentary",
      durationMs: 10000,
      prompt: "",
      model: "skyclip-v1",
      language: "en",
      voice: "shubh",
      brandProfile: "standard",
      createdAt: "2026-07-14T00:00:00.000Z",
      fps: 30,
    },
    timeline: withOverlap,
    assets: [
      {
        id: "a1",
        sourceType: "generated",
        mediaType: "image",
        label: "1",
        url: "color:#111",
        thumbnailUrl: "",
        metadata: { sourceKey: "color:#111" },
      },
      {
        id: "a2",
        sourceType: "generated",
        mediaType: "image",
        label: "2",
        url: "color:#222",
        thumbnailUrl: "",
        metadata: { sourceKey: "color:#222" },
      },
    ],
    history: [],
  };
  const man = buildTimelineManifestV1FromEditorState(state.project.id, state);
  assert.ok(Math.abs(man.metadata.duration_sec - 9.5) < 0.001, "manifest uses export estimate");

  console.log("export-duration.roundtrip: PASS");
}

main();
