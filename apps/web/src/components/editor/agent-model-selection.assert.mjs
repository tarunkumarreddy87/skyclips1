import assert from "node:assert/strict";
import { resolveEditorModelId } from "./agent-model-selection.ts";

const available = ["provider/current", "provider/vision"];
assert.equal(resolveEditorModelId("provider/removed", available), "", "removed models fall back to Default");
assert.equal(resolveEditorModelId("provider/current", available), "provider/current", "available selections remain selected");
assert.equal(resolveEditorModelId("", available), "", "Default remains selected");
console.log("Editor model selection regression checks passed");
