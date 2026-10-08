import assert from "node:assert/strict";
import { createEditorState } from "./mock-data";
import { useEditorStore, endGestureHistory } from "./store";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import { applyAgentOps } from "./agent/ops";
import type { TextItem } from "./types";

process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
const fixture = createEditorState("00000000-0000-4000-8000-000000000001");
fixture.timeline.id = "00000000-0000-4000-8000-000000000002";
const video = fixture.timeline.tracks.find((track) => track.type === "video")!;
const clip = video.items[0];
video.locked = true;
useEditorStore.setState(fixture);
const captionTrack = fixture.timeline.tracks.find((track) => track.type === "captions")!;
const captionItems = captionTrack.items.filter((item) => item.type === "captions");
if (captionItems.length > 1) {
  useEditorStore.getState().updateItemTransform(captionItems[0].id, {
    x: 50,
    y: 76,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    zIndex: 20,
  });
  const aligned = useEditorStore.getState().timeline.tracks
    .find((track) => track.type === "captions")!.items
    .filter((item): item is TextItem => item.type === "captions");
  assert.ok(aligned.every((item) => item.transform?.x === 50 && item.transform?.y === 76), "Moving one caption must align every caption cue");
}
const original = JSON.stringify(useEditorStore.getState().timeline);
assert.equal(useEditorStore.getState().deleteItem(clip.id), false);
assert.equal(useEditorStore.getState().duplicateItem(clip.id), null);
useEditorStore.getState().updateItemTransform(clip.id, { x: 30, y: 60, scaleX: 0.5, scaleY: 0.5, rotation: 10, zIndex: 2 });
useEditorStore.getState().moveItem(clip.id, 2000);
useEditorStore.getState().clearTrackItems(video.id);
assert.equal(JSON.stringify(useEditorStore.getState().timeline), original, "Locked track must not mutate");
assert.equal(applyAgentOps([{ op: "move_item", itemId: clip.id, startMs: 2000 }])[0].ok, false);
useEditorStore.getState().toggleTrackLocked(video.id);
const transform = { x: 30, y: 60, scaleX: 0.5, scaleY: 0.6, rotation: 10, zIndex: 2 };
useEditorStore.getState().updateItemTransform(clip.id, transform);
endGestureHistory();
const state = useEditorStore.getState();
const manifest = buildTimelineManifestV1FromEditorState(state.project.id, state);
assert.deepEqual(manifest.tracks.video.find((item) => item.id === clip.id)?.transform, transform);
const restored = JSON.parse(JSON.stringify({ project: state.project, timeline: state.timeline, assets: state.assets }));
const reopened = buildTimelineManifestV1FromEditorState(state.project.id, { ...state, ...restored });
assert.deepEqual(reopened, manifest, "Serialization must preserve renderer values");
const before = state.timeline.tracks.reduce((count, track) => count + track.items.length, 0);
assert.equal(applyAgentOps([{ op: "add_music" }])[0].ok, false);
assert.equal(useEditorStore.getState().timeline.tracks.reduce((count, track) => count + track.items.length, 0), before);
console.log("Store regressions passed: locks, transforms, serialization and no agent placeholders");
