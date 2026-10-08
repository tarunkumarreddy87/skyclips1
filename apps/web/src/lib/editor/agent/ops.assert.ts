import assert from "node:assert/strict";
import { createEditorState } from "../mock-data";
import { endGestureHistory, runAgentTransaction, useEditorStore } from "../store";
import { applyAgentOp, assertAllowedOp, type AgentOp } from "./ops";
import type { AudioItem, ClipItem } from "../types";
import type { HtmlTemplate, MotionScene } from "@hanuman/shared-types";

process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
const fixture = createEditorState("00000000-0000-4000-8000-000000000001");
fixture.timeline.durationMs = 10000;
const video = fixture.timeline.tracks.find(track => track.type === "video")!;
video.items = [{ ...(video.items[0]! as ClipItem), id: "scene", startMs: 0, endMs: 10000 }];
for (const track of fixture.timeline.tracks) if (track.type !== "video") track.items = [];
function reset() { endGestureHistory(); useEditorStore.setState({ ...structuredClone(fixture), editPast: [], editFuture: [] }); }
function allItems() { return useEditorStore.getState().timeline.tracks.flatMap(track => track.items); }
function apply(op: AgentOp) {
  const allowed = assertAllowedOp(op);
  assert.ok(allowed, `Valid operation: ${op.op}`);
  return runAgentTransaction(() => {
    const result = applyAgentOp(allowed);
    assert.equal(result.ok, true, result.error);
    return result;
  });
}

try {
  reset();
  apply({ op: "add_music", url: "https://example.com/music.mp3", volume: 0.35 });
  const music = allItems().find(item => item.type === "music")! as AudioItem;
  assert.equal(music.volume, 35, "35% gain must not become 0.35% in playback");
  apply({ op: "set_volume", itemId: music.id, volume: 0.5 });
  assert.equal((allItems().find(item => item.id === music.id)! as AudioItem).volume, 50);
  apply({ op: "add_sfx", url: "https://example.com/effect.mp3", volume: 0.8 });
  assert.equal((allItems().find(item => item.type === "sfx")! as AudioItem).volume, 80);
  apply({ op: "update_settings", patch: { musicVolume: 0.2, sfxVolume: 0, clipAudioVolume: 1 } });
  const settings = useEditorStore.getState().timeline.settings;
  assert.equal(settings.musicVolume, 20);
  assert.equal(settings.sfxVolume, 0);
  assert.equal(settings.clipAudioVolume, 100);

  reset();
  apply({ op: "move_item", itemId: "scene", startMs: 15000 });
  assert.equal(allItems().find(item => item.id === "scene")!.startMs, 15000);
  assert.equal(allItems().find(item => item.id === "scene")!.endMs, 25000);
  assert.equal(useEditorStore.getState().timeline.durationMs, 25000);
  useEditorStore.getState().undo();
  assert.equal(allItems().find(item => item.id === "scene")!.startMs, 0);
  assert.equal(useEditorStore.getState().timeline.durationMs, 10000);
  const beforeRollback = useEditorStore.getState().timeline;
  assert.throws(() => runAgentTransaction(() => {
    assert.equal(applyAgentOp({ op: "move_item", itemId: "scene", startMs: 20000 }).ok, true);
    throw new Error("Later edit failed");
  }), /Later edit failed/);
  assert.equal(useEditorStore.getState().timeline, beforeRollback, "Rollback must restore a move and the old timeline duration together");
  apply({ op: "split_item", itemId: "scene", atMs: 4000 });
  const splitClips = allItems().filter(item => item.type === "video") as ClipItem[];
  assert.equal(splitClips.length, 2);
  const leftHalf = splitClips.find(item => item.id === "scene")!;
  const rightHalf = splitClips.find(item => item.id !== "scene")!;
  assert.equal(leftHalf.endMs, 4000);
  assert.equal(rightHalf.startMs, 4000);
  assert.equal(rightHalf.endMs, 10000);
  assert.equal(rightHalf.sourceStartMs, (leftHalf.sourceStartMs ?? 0) + 4000);
  const beforeRejected = useEditorStore.getState().timeline;
  assert.equal(applyAgentOp({ op: "split_item", itemId: "scene", atMs: 4000 }).ok, false, "Splitting at an endpoint must not report success");
  assert.equal(applyAgentOp({ op: "move_item", itemId: "scene", startMs: 2000 }).ok, false, "Overlapping scene placement must be rejected");
  assert.equal(useEditorStore.getState().timeline, beforeRejected);
  reset();
  apply({ op: "add_text", text: "After the old end", startMs: 12000, durationMs: 8000 });
  const addedText = allItems().find(item => item.type === "text")!;
  assert.equal(addedText.startMs, 12000);
  assert.equal(addedText.endMs, 20000);
  assert.equal(useEditorStore.getState().timeline.durationMs, 20000);
  useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().timeline.durationMs, 10000);
  assert.equal(allItems().filter(item => item.type === "text").length, 0);

  reset();
  apply({ op: "add_motion_template", templateId: "chapter-title", startMs: 8000, durationMs: 12000, title: "Long overlay" });
  assert.equal(allItems().find(item => item.type === "animation")!.endMs, 20000);

  const scene: MotionScene = { version: 1, title: "Long scene", durationMs: 20000, background: "transparent", audio: [], layers: [{
    id: "title", kind: "text", x: 50, y: 50, width: 80, height: 15, text: "Timeline", color: "#ffffff", fontSize: 64, fontWeight: 700,
    fontFamily: "sans", align: "center", radius: 0, strokeWidth: 0, strokeColor: "#ffffff", shadow: 0, startMs: 0, endMs: 20000, easing: "smooth", keyframes: [],
  }] };
  reset();
  apply({ op: "add_motion_scene", scene, startMs: 5000 });
  const generated = allItems().find(item => item.type === "animation")!;
  assert.equal(generated.startMs, 5000);
  assert.equal(generated.endMs, 25000);
  assert.equal(useEditorStore.getState().timeline.durationMs, 25000);
  apply({ op: "update_motion_scene", itemId: generated.id, scene: { ...scene, durationMs: 30000 } });
  assert.equal(allItems().find(item => item.id === generated.id)!.endMs, 35000);

  reset();
  apply({ op: "add_animation", preset: "editorial-title", startMs: 0 });
  assert.equal((allItems().find(item => item.id === "scene")! as ClipItem).motionTemplate?.id, "editorial-title");
  assert.equal(allItems().filter(item => item.type === "animation").length, 0, "Full-frame styles must be placed on A-roll");
  const current = useEditorStore.getState();
  const second = { ...(video.items[0]! as ClipItem), id: "second", startMs: 10000, endMs: 15000 };
  useEditorStore.setState({ timeline: { ...current.timeline, durationMs: 15000, tracks: current.timeline.tracks.map(track => track.type === "video" ? { ...track, items: [...track.items, second] } : track) } });
  apply({ op: "add_motion_template", templateId: "editorial-archive", itemId: "second", startMs: 0 });
  assert.equal((allItems().find(item => item.id === "second")! as ClipItem).motionTemplate?.id, "editorial-archive", "Explicit clip identity wins over playhead and timing");
  assert.equal((allItems().find(item => item.id === "scene")! as ClipItem).motionTemplate?.id, "editorial-title", "The underlying scene must not be overwritten");
  const withBroll = useEditorStore.getState();
  useEditorStore.setState({ timeline: { ...withBroll.timeline, tracks: withBroll.timeline.tracks.map(track => track.type === "broll" ? { ...track, items: [{ ...(video.items[0]! as ClipItem), type: "broll", id: "foreground", startMs: 0, endMs: 4000 }] } : track) } });
  useEditorStore.getState().selectItem("foreground");
  assert.equal(applyAgentOp({ op: "add_motion_template", templateId: "editorial-archive", itemId: "foreground" }).ok, false);
  assert.equal(applyAgentOp({ op: "add_motion_template", templateId: "editorial-archive" }).ok, false, "A selected B-roll cannot silently redirect an edit to the A-roll beneath it");
  assert.equal((allItems().find(item => item.id === "scene")! as ClipItem).motionTemplate?.id, "editorial-title");
  const html: HtmlTemplate = { id: "00000000-0000-4000-8000-000000000002", profileId: "test", name: "Updated", description: "", tags: [], html: "<h1>Changed</h1>", css: "", js: "", durationSec: 10, assets: [], aiEnabled: true };
  apply({ op: "update_motion_template", itemId: "scene", htmlTemplate: html, layerEdits: {title: {x: 25}} });
  const template = (allItems().find(item => item.id === "scene")! as ClipItem).motionTemplate!;
  assert.equal(template.html_template?.html, "<h1>Changed</h1>");
  assert.equal(template.layer_edits?.title?.x, 25);
  apply({ op: "update_fit_mode", itemId: "scene", fitMode: "fill" });
  assert.equal((allItems().find(item => item.id === "scene")! as ClipItem).fitMode, "fill");
  assert.ok(assertAllowedOp({ op: "add_transition", afterItemId: "scene", type: "cut", durationMs: 0 }));

  reset();
  apply({ op: "add_animation", preset: "chapter-title" });
  const overlay = allItems().find(item => item.type === "animation")!;
  assert.equal(applyAgentOp({ op: "update_motion_template", itemId: overlay.id, layerEdits: { title: { x: 25 } } }).ok, false, "Unsupported layer edits must not silently succeed");
  console.log("Agent operation regressions passed: gain conversion, exact move/split, long text/template/scene timing, undo/rollback, full-frame template routing, HTML updates, fit modes and unsupported edit feedback.");
} finally { endGestureHistory(); }
