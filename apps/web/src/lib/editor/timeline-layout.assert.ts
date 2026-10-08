import assert from "node:assert/strict";
import { layoutTrack, trackRowHeight, TIMELINE_TRACK_GAP, resolveVisibleTracks } from "./timeline-layout";
import { createEditorState } from "./mock-data";
const track = createEditorState("test").timeline.tracks.find(t => t.type === "broll")!;
const base = track.items[0];
const layered = {...track, items: [
  {...base, id: "a", startMs: 0, endMs: 4000},
  {...base, id: "b", startMs: 2000, endMs: 5000},
  {...base, id: "c", startMs: 4000, endMs: 6000},
]};
const result = layoutTrack(layered);
assert.equal(result.offsets.get("a"), 0);
assert.equal(result.offsets.get("b"), trackRowHeight("broll") + TIMELINE_TRACK_GAP);
assert.equal(result.offsets.get("c"), 0);
assert.equal(result.height, 2 * trackRowHeight("broll") + TIMELINE_TRACK_GAP);
assert.deepEqual(layered.items.map(i => i.startMs), [0, 2000, 4000]);
assert.equal(layoutTrack(layered), result, "Unchanged tracks reuse geometry during playback");
console.log("Timeline layer layout passed: overlaps remain visible; timing is unchanged");
const duplicateType = { ...layered, id: "second-broll-track" };
assert.deepEqual(
  resolveVisibleTracks([layered, duplicateType], false, ["broll", "broll"]).map(t => t.id),
  [layered.id, duplicateType.id],
  "Multiple tracks of the same type must appear exactly once, in source order",
);
