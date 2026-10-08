import assert from "node:assert/strict";
import { createEditorState } from "./mock-data";
import { useEditorStore, endGestureHistory } from "./store";
import { applyAgentOps } from "./agent/ops";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import type { ClipItem, TextItem } from "./types";

process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
const fixture = createEditorState("00000000-0000-4000-8000-000000000001");
const scenes = fixture.timeline.tracks.find((track) => track.type === "video")!;
const base = scenes.items[0] as ClipItem;
scenes.items = [
  { ...base, id: "left", startMs: 0, endMs: 5000, sourceStartMs: undefined },
  { ...base, id: "right", startMs: 5000, endMs: 10000 },
];
fixture.timeline.transitions = [];
useEditorStore.setState(structuredClone(fixture));
assert.equal(applyAgentOps([{ op: "move_item", itemId: "left", startMs: 2000 }])[0].ok, false, "Agent must reject same-scene-lane overlaps");
assert.equal(useEditorStore.getState().timeline.tracks.find(t => t.type === "video")!.items[0].startMs, 0);
const unchanged = JSON.stringify(useEditorStore.getState().timeline);
useEditorStore.getState().trimItem("left", -1000, 7000);
useEditorStore.getState().moveItem("left", Number.NaN);
assert.equal(JSON.stringify(useEditorStore.getState().timeline), unchanged, "Invalid edits must leave timeline intact");
const splitId = useEditorStore.getState().splitItem("left", 2000)!;
const split = useEditorStore.getState().timeline.tracks.flatMap(t => t.items).find(i => i.id === splitId) as ClipItem;
assert.equal(split.sourceStartMs, 2000, "Splitting an implicit zero in-point must continue the source");
endGestureHistory();
useEditorStore.setState(structuredClone(fixture));
const captions = useEditorStore.getState().timeline.tracks.find(t => t.type === "captions")!;
const caption = { ...captions.items[0], id: "cue", type: "captions", startMs: 0, endMs: 5000,
  words: [{ text: "first", startSec: 0, durationSec: 1 }, { text: "second", startSec: 2, durationSec: 1 }] } as TextItem;
useEditorStore.setState({timeline: {...useEditorStore.getState().timeline, tracks: useEditorStore.getState().timeline.tracks.map(t => t.id === captions.id ? {...t, items: [caption]} : t)}});
useEditorStore.getState().trimItem("cue", 1500, 5000);
const trimmed = useEditorStore.getState().timeline.tracks.flatMap(t => t.items).find(i => i.id === "cue") as TextItem;
assert.equal(trimmed.words![0].startSec, 2, "Trimming must not shift absolute caption word clocks");
assert.equal(trimmed.words!.length, 1);
endGestureHistory();
console.log("Editing regressions passed: agent collisions, invalid ranges, source-continuous split and caption trim");

useEditorStore.setState(structuredClone(fixture));
const batch = applyAgentOps([
  { op: "add_motion_template", templateId: "vertical-bar-chart", startMs: 1000, title: "Evidence" },
  { op: "add_motion_template", templateId: "doc-callout", startMs: 1000, title: "Context" },
  { op: "add_broll", url: "https://example.com/asset.jpg", startMs: 1000, durationMs: 3000 },
]);
assert.equal(batch.every(result => result.ok), true);
const motion = useEditorStore.getState().timeline.tracks.flatMap(t => t.items).filter(i => i.type === "animation");
assert.equal(new Set(motion.map(i => i.id)).size, motion.length);
const chart = motion.find(i => i.type === "animation" && i.preset === "vertical-bar-chart")!;
assert.ok(chart.type === "animation" && chart.slots?.length, "Title-only update preserves chart data");
assert.equal(applyAgentOps([{op: "add_motion_template", templateId: "invented-template"}])[0].ok, false);
const transitionId = useEditorStore.getState().addTransition("left", "fade", 20000);
assert.ok(transitionId);
let state = useEditorStore.getState();
let rendered = buildTimelineManifestV1FromEditorState(state.project.id, state);
assert.equal(rendered.transitions?.[0].duration_sec, 5, "Transition duration is capped by both adjacent clips");
assert.ok(rendered.overlays?.some(o => o.id === chart.id), "Agent motion appears in the shared preview/export manifest");
assert.equal(rendered.tracks.broll?.some(c => c.start_sec === 1), true);
state.moveItem("right", 11000);
endGestureHistory();
state = useEditorStore.getState();
rendered = buildTimelineManifestV1FromEditorState(state.project.id, state);
assert.equal(rendered.transitions?.length, 0, "A detached transition cannot reach preview or export");
console.log("Agent batch regressions passed: chart slots, B-roll, template validation and valid transition seams");
