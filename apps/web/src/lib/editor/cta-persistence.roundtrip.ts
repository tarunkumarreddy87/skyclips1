/**
 * Phase 1 regression: CTA must persist via overlays[] SSOT, never invented from captions.
 *
 * Run: cd apps/web && pnpm exec tsx src/lib/editor/cta-persistence.roundtrip.ts
 */
import assert from "node:assert/strict";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import { mapManifestToTimeline } from "./manifest-mapper";
import type { EditorState } from "./types";
import type { TimelineManifestV1 } from "./manifest-types";

function minimalStateWithCta(): EditorState {
  return {
    project: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "CTA persistence",
      status: "editing",
      format: "documentary",
      durationMs: 30000,
      prompt: "test",
      model: "skyclip-v1",
      language: "en",
      voice: "shubh",
      brandProfile: "standard",
      createdAt: "2026-07-14T00:00:00.000Z",
      fps: 30,
    },
    timeline: {
      id: "tl-1",
      fps: 30,
      durationMs: 30000,
      tracks: [
        {
          id: "trk-video",
          type: "video",
          label: "Video",
          locked: false,
          hidden: false,
          items: [
            {
              id: "clip-a",
              type: "video",
              startMs: 0,
              endMs: 30000,
              label: "A",
              mediaType: "image",
              assetId: "asset-a",
              fitMode: "cover",
              muted: true,
              hidden: false,
            },
          ],
        },
        {
          id: "trk-narration",
          type: "narration",
          label: "Narration",
          locked: false,
          hidden: false,
          items: [
            {
              id: "nar-a",
              type: "narration",
              startMs: 0,
              endMs: 30000,
              label: "VO",
              assetId: "asset-nar",
              volume: 100,
              fadeIn: 0,
              fadeOut: 0,
              hidden: false,
            },
          ],
        },
        {
          id: "trk-captions",
          type: "captions",
          label: "Captions",
          locked: false,
          hidden: false,
          items: [
            {
              id: "cap-signoff",
              type: "captions",
              startMs: 25000,
              endMs: 29000,
              label: "Thanks for watching — subscribe!",
              text: "Thanks for watching — subscribe!",
              stylePreset: "default",
              fontSize: 18,
              color: "#ffffff",
              fontWeight: "500",
              alignment: "center",
              position: { x: 50, y: 88 },
              hidden: false,
            },
          ],
        },
        {
          id: "trk-anim",
          type: "animation",
          label: "Animation",
          locked: false,
          hidden: false,
          items: [
            {
              id: "anim-subscribe-cta",
              type: "animation",
              startMs: 25000,
              endMs: 30000,
              label: "Subscribe CTA",
              preset: "subscribe-cta",
              intensity: 80,
              position: { x: 85, y: 12 },
              transform: { x: 85, y: 12, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 5 },
              hidden: false,
            },
          ],
        },
        { id: "trk-broll", type: "broll", label: "B-roll", locked: false, hidden: false, items: [] },
        { id: "trk-music", type: "music", label: "Music", locked: false, hidden: false, items: [] },
        { id: "trk-sfx", type: "sfx", label: "SFX", locked: false, hidden: false, items: [] },
        { id: "trk-text", type: "text", label: "Text", locked: false, hidden: false, items: [] },
      ],
      transitions: [],
      settings: {
        zoom: 1,
        snappingEnabled: true,
        showTransitions: true,
        captionsEnabled: true,
        captionStyle: "bold_static",
        backgroundColor: "#000000",
        backgroundImage: null,
        overlayDropShadow: true,
        narrationVolume: 100,
        musicVolume: 35,
        sfxVolume: 50,
        clipAudioVolume: 0,
        themeId: "standard",
      },
    },
    assets: [
      {
        id: "asset-a",
        sourceType: "generated",
        mediaType: "image",
        label: "A",
        url: "color:#112233",
        thumbnailUrl: "",
        durationMs: 30000,
        metadata: { sourceKey: "color:#112233" },
      },
      {
        id: "asset-nar",
        sourceType: "generated",
        mediaType: "audio",
        label: "VO",
        url: "projects/x/nar.wav",
        thumbnailUrl: "",
        durationMs: 30000,
        metadata: { sourceKey: "projects/x/nar.wav" },
      },
    ],
    history: [],
  };
}

function main() {
  const state = minimalStateWithCta();
  const manifest = buildTimelineManifestV1FromEditorState(state.project.id, state);

  const ctas = (manifest.overlays || []).filter((o) => o.type === "subscribe_cta");
  assert.equal(ctas.length, 1, "agent/store CTA must export to overlays[]");
  assert.equal(ctas[0].text, "Subscribe CTA");

  const remapped = mapManifestToTimeline(manifest, {});
  const anim = remapped.tracks.find((t) => t.type === "animation")!;
  const ctaItems = anim.items.filter((i) => i.type === "animation" && i.preset === "subscribe-cta");
  assert.equal(ctaItems.length, 1, "reload must keep CTA from overlays[]");

  const noOverlay: TimelineManifestV1 = {
    ...manifest,
    overlays: [],
  };
  const ghost = mapManifestToTimeline(noOverlay, {});
  const ghostAnim = ghost.tracks.find((t) => t.type === "animation")!;
  const invented = ghostAnim.items.filter(
    (i) => i.type === "animation" && i.preset === "subscribe-cta",
  );
  assert.equal(invented.length, 0, "must NOT invent CTA from caption sign-off text");

  console.log("cta-persistence.roundtrip: PASS");
}

main();
