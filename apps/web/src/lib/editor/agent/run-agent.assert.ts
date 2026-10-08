import assert from "node:assert/strict";
import { createEditorState } from "../mock-data";
import { useEditorStore, endGestureHistory } from "../store";
import { runEditorAgent, type AgentActivity } from "./run-agent";
import { buildAgentContext } from "./context";
import { assertAllowedOp, applyAgentOp } from "./ops";
import type { ClipItem } from "../types";
import { describeAgentOp } from "./tool-description";

// Offline regression harness: no authentication, provider calls, uploads or autosave.
process.env.NEXT_PUBLIC_EDITOR_USE_MOCK = "true";
const fixture = createEditorState("00000000-0000-4000-8000-000000000001");
const scenes = fixture.timeline.tracks.find(t => t.type === "video")!;
const base = scenes.items[0] as ClipItem;
scenes.items = [{ ...base, id: "left", startMs: 0, endMs: 5000 }, { ...base, id: "right", startMs: 5000, endMs: 10000 }];
fixture.timeline.transitions = [];
const projectId = fixture.project.id;
const originalFetch = globalThis.fetch;
function reset() { endGestureHistory(); useEditorStore.setState({ ...structuredClone(fixture), editPast: [], editFuture: [] }); }
const plan = (ops: unknown[]) => new Response(JSON.stringify({ reply: "Proposed edits", ops, refused: false, modelUsed: "test/model" }), { status: 200 });
function mock(ops: unknown[]) { globalThis.fetch = async () => plan(ops); }

async function main() {
  try {
    reset();
    globalThis.fetch = async () => { throw new Error("A greeting must not call the server"); };
    for (const greeting of ["hi", "Hello!", "హాయ్", "హలో", "thanks"]) {
      assert.equal((await runEditorAgent(projectId, greeting, {mode: "control", verifyResult: true})).source, "local");
    }
    assert.equal(useEditorStore.getState().editPast.length, 0);
    let editingCalls = 0;
    globalThis.fetch = async () => { editingCalls++; return plan([]); };
    await runEditorAgent(projectId, "hi, trim this clip", {mode: "control"});
    assert.equal(editingCalls, 1, "A greeting plus instructions must reach the planner");

    assert.equal(describeAgentOp({ op: "update_settings", patch: { captionStyle: "minimal" } }), "Update caption style: minimal");
    reset(); mock([{ op: "add_transition", afterItemId: "left", type: "glitch", durationMs: 400 }]);
    const activities: AgentActivity[] = [];
    const before = useEditorStore.getState().timeline;
    const proposed = await runEditorAgent(projectId, "Add a glitch", { mode: "plan", onActivity: a => activities.push(a) });
    assert.equal(useEditorStore.getState().timeline, before, "Plan mode must not mutate the timeline");
    assert.match(proposed.plannedChanges![0], /glitch/);
    assert.equal(proposed.approve, undefined, "Plan mode exposes no edit action");
    assert.equal((await runEditorAgent(projectId, "Add a glitch", {mode:"control", onActivity:a=>activities.push(a)})).results.length, 1);
    assert.equal(useEditorStore.getState().editPast.length, 1, "A batch is one undo step");

    assert.ok(activities.some(a => a.tool === "add_transition" && a.status === "complete"));
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().timeline.transitions.length, 0);

    reset(); mock([{ op: "update_settings", patch: { captionStyle: "minimal" } }]);
    const originalCaptionStyle = useEditorStore.getState().timeline.settings.captionStyle;
    const captionPlan = await runEditorAgent(projectId, "Minimal captions", { mode: "control" });
    assert.equal(captionPlan.results.length, 1);
    assert.equal(useEditorStore.getState().timeline.settings.captionStyle, "minimal");
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().timeline.settings.captionStyle, originalCaptionStyle);
    assert.equal(useEditorStore.getState().editFuture.length, 1);

    mock([{ op: "redo" }]);
    assert.equal((await runEditorAgent(projectId, "Redo", { mode: "control" })).results.length, 1);
    assert.equal(useEditorStore.getState().timeline.settings.captionStyle, "minimal");
    assert.equal(useEditorStore.getState().editFuture.length, 0);
    mock([{ op: "undo" }]);
    assert.equal((await runEditorAgent(projectId, "Undo", { mode: "control" })).results.length, 1);
    assert.equal(useEditorStore.getState().timeline.settings.captionStyle, originalCaptionStyle);
    assert.equal(useEditorStore.getState().editFuture.length, 1, "Agent undo preserves the redo history");

    reset(); mock([{ op: "add_text", text: "Test" }]);
    const stale = await runEditorAgent(projectId, "Add text", { mode: "plan" });
    useEditorStore.getState().updateSettings({ captionStyle: "minimal" });
    assert.equal(stale.approve, undefined, "A read-only plan cannot apply stale edits");

    reset();
    globalThis.fetch = async () => { useEditorStore.getState().updateSettings({ musicVolume: 0.1 }); return plan([{ op: "add_text", text: "Late" }]); };
    assert.equal((await runEditorAgent(projectId, "Add text", { mode: "control" })).source, "error", "Control mode detects edits during planning");

    reset();
    const controller = new AbortController();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    globalThis.fetch = async () => { entered(); await new Promise<void>(r => { release = r; }); return plan([{ op: "add_text", text: "Late" }]); };
    const pending = runEditorAgent(projectId, "Add text", { mode: "control", signal: controller.signal });
    await started; controller.abort();
    assert.equal((await pending).source, "stopped");
    release(); await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(useEditorStore.getState().timeline, fixture.timeline, "A response arriving after Stop must not edit");

    reset(); mock([{ op: "update_caption_style", style: "minimal" }, { op: "move_item", itemId: "missing", startMs: 2 }]);
    const rollbackEvents: AgentActivity[] = [];
    const failed = await runEditorAgent(projectId, "Batch", { mode: "control", repairAttempt: 1, onActivity: a => rollbackEvents.push(a) });
    assert.equal(failed.source, "error");
    assert.deepEqual(useEditorStore.getState().timeline, fixture.timeline, "A failed batch must roll back earlier changes");
    assert.equal(useEditorStore.getState().editPast.length, 0);
    assert.equal(rollbackEvents.filter(a => a.status === "rolled-back").length, 2);

    reset();
    const context = buildAgentContext(["left", "right", "left", "missing"]);
    assert.deepEqual(context.selectedItemIds, ["left", "right"]);
    assert.equal(context.scenes.length, fixture.timeline.tracks.flatMap(t => t.items).filter(i => i.type === "video" || i.type === "broll").length);
    assert.equal(context.items.length, fixture.timeline.tracks.flatMap(t => t.items).length);
    for (const scene of context.scenes) {
      for (const caption of scene.captions) {
        assert.ok(caption.startMs >= scene.startMs && caption.endMs <= scene.endMs);
      }
    }
    assert.ok(assertAllowedOp({ op: "update_motion_template", itemId: "left", layerEdits: { title: {x: 10, y: 20, text: "Updated"} } }));
    assert.equal(assertAllowedOp({ op: "update_motion_template", itemId: "left", layerEdits: {title: {scaleX: -1}} }), null);
    assert.ok(context.soundLibrary.length >= 8);
    assert.ok(assertAllowedOp({ op: "add_sfx", url: context.soundLibrary[0].url }));
    assert.equal(assertAllowedOp({ op: "add_sfx", url: "/sfx/../../secret" }), null);
    assert.equal(assertAllowedOp({ op: "update_clip_effects", itemId: "left", patch: { filterId: "invented" } }), null);
    assert.equal(assertAllowedOp({ op: "update_clip_effects", itemId: "left", patch: { strength: 7 } }), null);
    assert.equal(applyAgentOp({ op: "set_volume", itemId: "left", volume: 0.2 }).ok, false, "Incompatible tools must not report success");
    mock([{ op: "update_clip_effects", itemId: "left", patch: { filterId: "cinema", strength: 0.6 } }]);
    assert.equal((await runEditorAgent(projectId, "Grade", { mode: "control" })).results[0].ok, true);
    const graded = useEditorStore.getState().timeline.tracks.flatMap(t => t.items).find(i => i.id === "left") as ClipItem;
    assert.equal(graded.visualEffects?.strength, 0.6);
    const transitionId = useEditorStore.getState().addTransition("left", "glitch", 400)!;
    assert.equal(applyAgentOp({ op: "set_transition_sound", transitionId, enabled: false }).ok, true);
    assert.equal(useEditorStore.getState().timeline.transitions[0].sfxMuted, true);

    reset(); mock([{ op: "update_caption_style", style: "minimal" }]);
    const cancelledApproval = new AbortController();
    const awaiting = await runEditorAgent(projectId, "Plan", { mode: "plan", signal: cancelledApproval.signal });
    cancelledApproval.abort();
    assert.equal(awaiting.approve, undefined);
    assert.deepEqual(useEditorStore.getState().timeline, fixture.timeline);
    reset();
    let planCalls = 0;
    globalThis.fetch = async () => { planCalls++; return plan([{op:"remove_background",itemId:"left"}]); };
    const cutoutPlan = await runEditorAgent(projectId, "Remove background", {mode:"plan"});
    assert.equal(planCalls, 1, "Plan mode must not call image processing/upload APIs");
    assert.equal(cutoutPlan.plannedChanges?.length, 1);
    assert.deepEqual(useEditorStore.getState().timeline, fixture.timeline);
    reset();
    let reviewCalls = 0;
    globalThis.fetch = async () => {
      reviewCalls++;
      if (reviewCalls === 1) return plan([{ op: "update_settings", patch: { captionStyle: "minimal" } }]);
      assert.equal(useEditorStore.getState().timeline.settings.captionStyle, "minimal", "Review must read committed edits");
      return plan([]);
    };
    const reviewed = await runEditorAgent(projectId, "Minimal captions", { mode: "control", verifyResult: true });
    assert.equal(reviewCalls, 2, "One post-edit review is bounded and does not recurse");
    assert.equal(reviewed.source, "llm");
    assert.equal(useEditorStore.getState().editPast.length, 1, "No-op review must not create an undo step");

    reset();
    let steps = 0;
    globalThis.fetch = async () => {
      steps++;
      if (steps === 1) return plan([{op:"update_settings",patch:{captionStyle:"minimal"}}]);
      if (steps === 2) return plan([{op:"update_settings",patch:{musicVolume:0.2}}]);
      assert.equal(useEditorStore.getState().timeline.settings.musicVolume, 20);
      return plan([]);
    };
    const multiStep = await runEditorAgent(projectId,"Edit captions and music",{mode:"control",verifyResult:true});
    assert.equal(steps,3,"Continue until the model returns no further edits");
    assert.equal(multiStep.results.length,2);
    reset();
    let repeatedSteps = 0;
    globalThis.fetch = async () => { repeatedSteps++; return plan([{op:"update_settings",patch:{musicVolume:0.1 * (repeatedSteps % 5)}}]); };
    const bounded = await runEditorAgent(projectId,"Adjust music",{mode:"control",verifyResult:true});
    assert.equal(repeatedSteps,7);
    assert.match(bounded.reply,/before confirming completion/);

    reset();
    let repairCalls = 0;
    globalThis.fetch = async () => {
      repairCalls++;
      return plan(repairCalls === 1 ? [{op:"move_item",itemId:"missing",startMs:100}] : [{op:"update_caption_style",style:"minimal"}]);
    };
    const repaired = await runEditorAgent(projectId,"Restyle this scene",{mode:"control"});
    assert.equal(repairCalls,2,"A rejected tool batch gets one bounded repair using fresh context");
    assert.equal(repaired.source,"llm");
    assert.equal(repaired.results.length,1);
    assert.equal(useEditorStore.getState().editPast.length,1,"Failed repair attempts must leave no undo entry");

    reset();
    let invalidCalls = 0;
    globalThis.fetch = async () => {
      invalidCalls++;
      return plan(invalidCalls === 1 ? [{op:"update_clip_effects",itemId:"left",patch:{filterId:"invalid-filter"}}] : [{op:"update_clip_effects",itemId:"left",patch:{filterId:"cinema"}}]);
    };
    const repairedArgs = await runEditorAgent(projectId,"Grade this scene",{mode:"control"});
    assert.equal(invalidCalls,2,"Invalid frontend tool arguments must be fed back once for correction");
    assert.equal(repairedArgs.results.length,1);

    reset();
    let scopeCalls = 0;
    const scopedEvents: AgentActivity[] = [];
    globalThis.fetch = async (_input,init) => {
      const body=JSON.parse(String(init?.body));
      assert.deepEqual(body.context.selectedItemIds,["left"],"Follow-up must keep the user's scope even when adding text selects the new text");
      scopeCalls++;
      return plan(scopeCalls === 1 ? [{op:"add_text",text:"A new headline",startMs:0,durationMs:3000}] : []);
    };
    const scoped = await runEditorAgent(projectId,"Add headline to selected scene",{mode:"control",verifyResult:true,mentionedItemIds:["left"],onActivity:event=>scopedEvents.push(event)});
    assert.equal(scoped.results.length,1);
    assert.ok(scopedEvents.some(event=>event.id==="step-1/context"),"Review activities must not overwrite initial activities");
    assert.equal(buildAgentContext([]).selectedItemIds.length,0,"Explicit whole-timeline scope must not fall back to UI selection");

    console.log("Agent regressions passed: read-only plans, instant greetings, single undo, stale plans, stop/late response, rollback, scope, filters and transition sound.");
  } finally { globalThis.fetch = originalFetch; endGestureHistory(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
