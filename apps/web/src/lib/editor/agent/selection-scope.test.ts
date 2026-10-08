import test from "node:test";
import assert from "node:assert/strict";
import { validateSelectionOps, assertSelectionPreserved } from "./selection-scope";

const scene = { id: "scene", type: "video", startMs: 1000, endMs: 5000 };
const other = { id: "other", type: "video", startMs: 5000, endMs: 9000 };
const caption = { id: "caption", type: "captions", startMs: 2000, endMs: 3000 };
const context = { selectedItemIds: ["scene"], items: [scene, other, caption] };
const snapshot = () => ({ project: { id: "project" }, timeline: { durationMs: 9000, settings: {}, transitions: [], tracks: [{ id: "video", items: [{ ...scene }, { ...other }] }, { id: "captions", items: [{ ...caption }] }] }, assets: [{ id: "asset" }] });

test("selected edits and contained additions pass", () => {
  validateSelectionOps([{ op: "update_text", itemId: "caption" }, { op: "add_sfx", startMs: 4000, durationMs: 500 }], context);
});
test("unrelated, global and escaped timing edits fail", () => {
  for (const op of [{ op: "delete_item", itemId: "other" }, { op: "update_settings", patch: {} }, { op: "move_item", itemId: "scene", startMs: 2000 }, { op: "add_text", startMs: 2000 }, { op: "add_sfx", startMs: 4900, durationMs: 500 }]) assert.throws(() => validateSelectionOps([op], context));
});
test("postcondition detects collateral changes even for valid-looking operations", () => {
  const before = snapshot(), after = snapshot();
  after.timeline.tracks[0]!.items[1]!.endMs = 8500;
  assert.throws(() => assertSelectionPreserved(before, after, context));
});
test("postcondition allows only in-scope new items and retained asset identity", () => {
  const before = snapshot(), after = snapshot();
  after.timeline.tracks[1]!.items.push({ id: "new", type: "text", startMs: 1500, endMs: 4000 });
  assertSelectionPreserved(before, after, context);
  after.timeline.tracks[1]!.items[1]!.endMs = 6000;
  assert.throws(() => assertSelectionPreserved(before, after, context));
});
