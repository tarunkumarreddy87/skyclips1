import assert from "node:assert/strict";
import { compositionTextFontPx, compositionCaptionFontPx, editorTextFontSize, editorCaptionFontSize } from "./text-size";
import { createEditorState } from "./mock-data";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import { mapManifestToTimeline } from "./manifest-mapper";

// Increasing a size past the old 36/40 boundary must never shrink the picture.
for (const convert of [compositionTextFontPx, compositionCaptionFontPx]) {
  let previous = 0;
  for (let size = 14; size <= 64; size += 0.25) {
    assert.ok(convert(size) >= previous);
    previous = convert(size);
  }
}
for (let pixels = 8; pixels <= 200; pixels++) {
  assert.equal(compositionTextFontPx(editorTextFontSize(pixels)), pixels);
  if (pixels <= 120) assert.equal(compositionCaptionFontPx(editorCaptionFontSize(pixels)), pixels);
}
const state = createEditorState("text-roundtrip");
const textTrack = state.timeline.tracks.find(track => track.type === "text")!;
textTrack.items = [{ id:"telugu-title", type:"text", text:"వాణిజ్యం మరియు నగరీకరణ", label:"Title", startMs:0, endMs:3000, fontSize:32, fontWeight:"700", color:"#ffffff", alignment:"center", stylePreset:"default", position:{x:50,y:50}, hidden:false }];
const original = buildTimelineManifestV1FromEditorState(state.project.id, state);
let current = original;
for (let cycle = 0; cycle < 5; cycle++) {
  const timeline = mapManifestToTimeline(JSON.parse(JSON.stringify(current)), {});
  current = buildTimelineManifestV1FromEditorState(state.project.id, {...state, timeline});
  assert.deepEqual(current.overlays?.find(item => item.id === "telugu-title")?.style, original.overlays?.find(item => item.id === "telugu-title")?.style, "Save/reload must not grow text");
  assert.deepEqual(current.tracks.captions.map(caption => caption.style?.font_size_px), original.tracks.captions.map(caption => caption.style?.font_size_px));
}
console.log("Text sizing passed: continuous resize, exact persisted pixels and five multilingual save/reload cycles");
