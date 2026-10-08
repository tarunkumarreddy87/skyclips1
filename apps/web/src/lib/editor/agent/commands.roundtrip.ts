import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentOp } from "./operation-schema";
import { applyAgentOps } from "./ops";
import { useEditorStore } from "../store";
import { buildTimelineManifestV1FromEditorState } from "../build-timeline-manifest";
import { mapManifestToTimeline } from "../manifest-mapper";
import { validateEditorStateForRender } from "../validate-render";
import type { EditorState } from "../types";

function seed(): EditorState {
  const current = useEditorStore.getState();
  return {
    project: { ...current.project, id: "test-project", title: "Test", durationMs: 8000 },
    timeline: { ...current.timeline, id: "test-timeline", durationMs: 8000,
      settings: { ...current.timeline.settings, captionStyle: "cinematic", clipAudioVolume: 100 }, transitions: [],
      tracks: [
        { id: "n", type: "narration", label: "Narration", hidden: false, locked: false, items: [{ id: "narration", type: "narration", startMs: 0, endMs: 8000, label: "Voice", hidden: false, assetId: "audio", volume: 100, fadeIn: 0, fadeOut: 0 }] },
        { id: "b", type: "broll", label: "Footage", hidden: false, locked: false, items: [{ id: "footage", type: "broll", startMs: 0, endMs: 8000, label: "Uploaded video", hidden: false, assetId: "video", mediaType: "video", fitMode: "cover", muted: false, sourceStartMs: 1200 }] },
        ...(["video", "animation", "music", "sfx", "captions", "text"] as const).map((type) => ({ id: type, type, label: type, hidden: false, locked: false, items: [] })),
      ] },
    assets: [
      { id: "audio", mediaType: "audio", sourceType: "local", label: "Voice", url: "https://example.test/voice.wav", thumbnailUrl: "", durationMs: 8000, metadata: { sourceKey: "project/voice.wav" } },
      { id: "video", mediaType: "video", sourceType: "local", label: "Uploaded video", url: "https://example.test/video.mp4", thumbnailUrl: "", durationMs: 10000, metadata: { sourceKey: "project/video.mp4" } },
    ], history: [],
  };
}

test("invalid model payloads never reach the store", () => {
  for (const op of [
    { op: "set_volume", itemId: "audio", volume: Number.NaN },
    { op: "move_item", itemId: "video", startMs: "2 seconds" },
    { op: "trim_item", itemId: "video", startMs: 2000, endMs: 1000 },
    { op: "set_keyframes", itemId: "frame", keyframes: [{ time_sec: 2 }, { time_sec: 1 }] },
    { op: "add_graphic", type: "bar_chart" },
    { op: "update_caption_style", style: "bad_style" },
    { op: "update_settings", patch: { invented: true } },
    { op: "regenerate_voice" },
  ]) assert.equal(parseAgentOp(op), null);
  assert.deepEqual(parseAgentOp({ op: "set_transition", item_id: "video", type: "glitch" }), { op: "add_transition", afterItemId: "video", type: "glitch" });
});

test("agent edits captions and narration with undo, respecting locked tracks", async () => {
  process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
  useEditorStore.setState({ ...seed(), editPast: [], editFuture: [] });
  assert.equal(applyAgentOps([{ op: "set_volume", itemId: "narration", volume: 0.6 }])[0]?.ok, true);
  assert.equal((useEditorStore.getState().timeline.tracks[0]!.items[0] as { volume: number }).volume, 60);
  applyAgentOps([{ op: "undo" }]);
  assert.equal((useEditorStore.getState().timeline.tracks[0]!.items[0] as { volume: number }).volume, 100);
  applyAgentOps([{ op: "update_caption_style", style: "editorial" }]);
  assert.equal(useEditorStore.getState().timeline.settings.captionStyle, "editorial");
  assert.equal(applyAgentOps([{ op: "move_item", itemId: "missing", startMs: 20 }])[0]?.ok, false);
  const store = useEditorStore.getState();
  useEditorStore.setState({ timeline: { ...store.timeline, tracks: store.timeline.tracks.map((track) => ({ ...track, locked: track.type === "broll" })) } });
  assert.equal(applyAgentOps([{ op: "delete_item", itemId: "footage" }])[0]?.ok, false);
  assert.equal(applyAgentOps([{ op: "add_sfx" }])[0]?.ok, false, "No phantom sound with an empty source");
  await useEditorStore.getState().flushSave();
});

test("graphic identity, motion, captions, source audio and timing survive manifest roundtrip", async () => {
  process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
  useEditorStore.setState({ ...seed(), editPast: [], editFuture: [] });
  const data = [{ label: "A", value: 35 }, { label: "B", value: 70 }];
  const result = applyAgentOps([{ op: "add_graphic", type: "bar_chart", text: "Results", data, startMs: 2000, durationMs: 4000, keyframes: [{ time_sec: 0, x: 25 }, { time_sec: 4, x: 75 }] }]);
  assert.equal(result[0]?.ok, true);
  const state = useEditorStore.getState();
  const graphic = state.getSelectedItem();
  assert.ok(graphic?.type === "animation" && graphic.graphic);
  state.updateGraphic(graphic.id, { transform: { x: 45, y: 40 } });
  const manifest = buildTimelineManifestV1FromEditorState("test-project", useEditorStore.getState());
  assert.equal(manifest.metadata.duration_sec, 8);
  assert.equal(manifest.settings?.caption_style, "cinematic");
  assert.equal(manifest.settings?.clip_audio_volume, 1);
  assert.equal(manifest.tracks.broll?.[0]?.muted, false);
  assert.equal(manifest.tracks.broll?.[0]?.source_start_sec, 1.2);
  assert.deepEqual(manifest.graphics?.[0]?.data, data);
  assert.equal(manifest.graphics?.[0]?.transform?.x, 45, "Graphic edits update the timeline transform");
  const loaded = mapManifestToTimeline(manifest, {});
  const restored = loaded.tracks.find((track) => track.type === "animation")?.items[0];
  assert.ok(restored?.type === "animation" && restored.graphic);
  assert.equal(restored.id, graphic.id);
  assert.equal(restored.startMs, 2000);
  assert.deepEqual(restored.graphic.keyframes, manifest.graphics?.[0]?.keyframes);
  assert.equal((loaded.tracks.find((track) => track.type === "broll")?.items[0] as { muted: boolean }).muted, false);
  const footageOnly = seed(); footageOnly.timeline.tracks = footageOnly.timeline.tracks.filter((track) => track.type !== "narration");
  assert.equal(validateEditorStateForRender("test-project", footageOnly).ok, true);
  await useEditorStore.getState().flushSave();
});
