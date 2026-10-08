import { useEditorStore, runAgentTransaction } from "../store";

import { applyAgentOp, assertAllowedOp, type AgentOp, type AgentOpResult } from "./ops";

import { prepareImageCutout } from "../remove-image-background";
import { buildAgentContext } from "./context";

import { describeAgentOp } from "./tool-description";

import { planEditorAgentOps } from "@/lib/api-client";
import { collectVisualEvidence } from "./visual-evidence";
import { uploadSoundEffect } from "../sound-effects";
import { generateShortId } from "@/lib/id";
import type { Asset } from "../types";
import { validateSelectionOps, assertSelectionPreserved } from "./selection-scope";

export interface AgentActivity {

  id: string;

  label: string;

  tool?: string;

  status: "running" | "complete" | "error" | "cancelled" | "rolled-back";

  detail?: string;

}

export interface AgentChatResult {

  reply: string;

  source: "local" | "llm" | "refuse_tts" | "error" | "stopped";

  results: AgentOpResult[];

  modelUsed?: string;

  approve?: () => AgentChatResult;

  plannedChanges?: string[];

}

class InvalidAgentPlanError extends Error {}

/** Upload cues before applying edits; insert their asset records within the rollback boundary. */
async function prepareSoundOps(projectId: string, ops: AgentOp[], signal?: AbortSignal): Promise<{ ops: AgentOp[]; assets: Asset[] }> {
  const prepared: AgentOp[] = []; const assets: Asset[] = [];
  for (const op of ops) {
    signal?.throwIfAborted();
    if (op.op !== "add_sfx" || !op.preset || op.url) { prepared.push(op); continue; }
    const existing = [...useEditorStore.getState().assets, ...assets].find(asset => asset.metadata?.soundPreset === op.preset);
    if (existing) { prepared.push({ ...op, url: existing.url, label: op.label ?? existing.label, durationMs: op.durationMs ?? existing.durationMs }); continue; }
    const sound = await uploadSoundEffect(projectId, op.preset);
    signal?.throwIfAborted();
    assets.push({ id: `sfx-asset-${generateShortId()}`, mediaType: "audio", sourceType: "local", label: sound.label, url: sound.url, thumbnailUrl: "", durationMs: sound.durationMs, metadata: { sourceKey: sound.sourceKey, soundPreset: op.preset } });
    prepared.push({ ...op, url: sound.url, label: op.label ?? sound.label, durationMs: op.durationMs ?? sound.durationMs });
  }
  return { ops: prepared, assets };
}

/** Preview navigation is harmless; any saved edit invalidates an outstanding plan. */

function editSignature(state: ReturnType<typeof useEditorStore.getState>) {

  const { previewVolume: _previewVolume, previewMuted: _previewMuted, snappingEnabled: _snapping, zoom: _zoom, trackOrder: _trackOrder, ...settings } = state.timeline.settings;

  void _previewVolume; void _previewMuted; void _snapping; void _zoom; void _trackOrder;

  return JSON.stringify({ project: state.project, duration: state.timeline.durationMs, fps: state.timeline.fps, settings });

}

export async function runEditorAgent(projectId: string, message: string, opts?: {

  verifyResult?: boolean;
  repairAttempt?: number;
  activityPrefix?: string;
  speed?: "fast" | "smart"; referenceImageUrl?: string | null; modelId?: string;

  mode?: "plan" | "control";

  mentionedItemIds?: string[];

  referenceAsset?: { url: string; label: string };

  signal?: AbortSignal;

  conversation?: Array<{ role: "user" | "assistant"; content: string }>;

  onActivity?: (activity: AgentActivity) => void;

}): Promise<AgentChatResult> {

  // Standalone social messages do not need project context or a remote planner.
  // Exact matching ensures “hi, trim this clip” still reaches editing tools.
  const greeting = message.trim().toLocaleLowerCase().replace(/[!?.。]+$/u, "").trim();
  if (!opts?.signal?.aborted && !opts?.referenceAsset && !opts?.referenceImageUrl) {
    const replies: Record<string, string> = {
      hi: "Hi! What would you like to change in your video?",
      hello: "Hello! Tell me what you'd like to edit.",
      hey: "Hey! What would you like to edit?",
      "హాయ్": "హాయ్! మీ వీడియోలో ఏం మార్చాలో చెప్పండి.",
      "హలో": "హలో! మీ వీడియోలో ఏం ఎడిట్ చేయాలో చెప్పండి.",
      "నమస్తే": "నమస్తే! మీ వీడియోలో ఏం మార్చాలో చెప్పండి.",
      thanks: "You're welcome!", "thank you": "You're welcome!",
      "ధన్యవాదాలు": "మరేం మార్చాలన్నా చెప్పండి.",
    };
    if (Object.prototype.hasOwnProperty.call(replies, greeting)) {
      return {reply: replies[greeting], source: "local", results: []};
    }
  }

  const before = useEditorStore.getState();

  const signature = editSignature(before);

  const stale: AgentChatResult = { reply: "The timeline changed while this plan was being prepared. No edits were applied. Ask again using the current timeline.", source: "error", results: [] };

  const stopped: AgentChatResult = { reply: "Stopped. No edits were applied.", source: "stopped", results: [] };

  const isStale = () => {

    const current = useEditorStore.getState();

    return current.project.id !== projectId || current.timeline.tracks !== before.timeline.tracks ||

      current.timeline.transitions !== before.timeline.transitions || current.assets !== before.assets || editSignature(current) !== signature;

  };

  const emit = (activity: AgentActivity) => opts?.onActivity?.({...activity, id: `${opts?.activityPrefix || ""}${activity.id}`});

  let phase = "context";

  if (before.project.id !== projectId) return stale;

  try {

    opts?.signal?.throwIfAborted();

    const context = { ...buildAgentContext(opts?.mentionedItemIds), visualEvidence: await collectVisualEvidence(message, { signal: opts?.signal, itemIds: opts?.mentionedItemIds }) };
    opts?.signal?.throwIfAborted();
    if (isStale()) return stale;

    if (opts?.referenceAsset) context.assets.unshift({ id: "attached-reference", label: opts.referenceAsset.label, mediaType: "image", url: opts.referenceAsset.url, thumbnailUrl: opts.referenceAsset.url });

    emit({ id: "context", label: "Read timeline context", status: "complete", detail: `${context.items.length} clips · ${context.selectedItemIds.length} referenced · playhead ${(context.playheadMs / 1000).toFixed(1)}s` });

    phase = "plan";

    emit({ id: phase, label: "Plan edits", status: "running", detail: "Matching your request to the editor’s tools" });

    const planned = await planEditorAgentOps(projectId, {

      message: `Prepare edits for ${opts?.mode === "control" ? "automatic application" : "read-only planning; explain the proposed changes without applying them"}. Nothing has been applied yet. Describe your intent concisely; do not claim success before tools run.\n\n${message}`,

      speed: opts?.speed ?? "fast", modelId: opts?.modelId || undefined,

      referenceImageUrl: opts?.referenceImageUrl || undefined, conversation: opts?.conversation?.slice(-8), context,

    }, opts?.signal);

    opts?.signal?.throwIfAborted();

    if (isStale()) { emit({ id: phase, label: "Timeline changed", status: "error", detail: stale.reply }); return stale; }

    emit({ id: phase, label: "Plan prepared", status: "complete", detail: planned.reply });

    if (planned.refused) return { reply: planned.reply, source: "refuse_tts", results: [] };

    phase = "validate";
    if (!Array.isArray(planned.ops) || planned.ops.length > 40) throw new InvalidAgentPlanError("Return an array with at most 40 valid editing operations.");
    if (planned.ops.length > 1 && planned.ops.some(raw => raw?.op === "undo" || raw?.op === "redo")) throw new InvalidAgentPlanError("Undo or redo must be a standalone operation; do not mix history navigation with new edits.");
    for (const [index, raw] of planned.ops.entries()) {
      const cutout = raw?.op === "remove_background" && typeof raw.itemId === "string" && raw.itemId.trim();
      if (!cutout && !assertAllowedOp(raw)) throw new InvalidAgentPlanError(`Operation ${index + 1} is not supported or has invalid fields: ${JSON.stringify(raw).slice(0, 1200)}`);
    }
    try { validateSelectionOps(planned.ops, context); }
    catch (error) { throw new InvalidAgentPlanError(error instanceof Error ? error.message : "The plan exceeds the selected clip scope."); }

    if (opts?.mode !== "control") {
      const changes = (planned.ops || []).map(raw => {
        if (raw.op === "remove_background" && typeof raw.itemId === "string") return "Remove the selected image background";
        const valid = assertAllowedOp(raw);
        if (!valid) throw new Error("The model returned an invalid proposed edit. Nothing was changed.");
        return describeAgentOp(valid);
      });
      return {reply: planned.reply || "Here is the proposed editing plan.", source: "llm", results: [], plannedChanges: changes, modelUsed: planned.modelUsed || undefined};
    }

    const resolvedOps: Record<string, unknown>[] = [];
    for (const raw of planned.ops || []) {
      if (raw.op !== "remove_background") { resolvedOps.push(raw); continue; }
      const clip=before.timeline.tracks.flatMap(t=>t.items).find(i=>i.id===raw.itemId);
      const asset=clip && "assetId" in clip ? before.assets.find(a=>a.id===clip.assetId):undefined;
      if (!asset || asset.mediaType!=="image") throw new Error("Background removal requires a still image");
      if (before.timeline.tracks.some(t=>t.locked&&t.items.some(i=>i.id===raw.itemId))) throw new Error("Selected image is locked");
      opts?.signal?.throwIfAborted();
      emit({id:"cutout",tool:"remove_background",label:"Remove image background",status:"running"});
      const precedingReplacement = [...resolvedOps].reverse().find(op => op.op === "replace_media" && op.itemId === raw.itemId);
        const source = precedingReplacement ? {url: String(precedingReplacement.url)} : asset;
        const cutout=await prepareImageCutout(projectId,source);
      opts?.signal?.throwIfAborted();
      resolvedOps.push({op:"replace_media",itemId:raw.itemId,url:cutout.downloadUrl,sourceLabel:`${asset.label} · Cutout`});
      emit({id:"cutout",tool:"remove_background",label:"Image cutout ready",status:"complete"});
    }
    if(isStale())return stale;
    const validatedOps = resolvedOps.map(raw => {

      const valid = assertAllowedOp(raw);

      if (!valid) throw new Error("The model returned an unsupported or invalid edit. No changes were applied.");

      return valid;

    });

    const prepared = await prepareSoundOps(projectId, validatedOps, opts?.signal);
    if (isStale()) return stale;
    const ops = prepared.ops;
    validateSelectionOps(ops, context);
    if (ops.length > 40) throw new Error("This plan exceeds the 40-edit limit. Ask for a smaller batch.");

    if (!ops.length) return { reply: planned.reply || "No edits planned.", source: "llm", results: [], modelUsed: planned.modelUsed || undefined };

    emit({ id: phase, label: `Validated ${ops.length} ${ops.length === 1 ? "edit" : "edits"}`, status: "complete" });

    let consumed = false;

    const apply = (): AgentChatResult => {

      if (opts?.signal?.aborted) return stopped;

      if (consumed || isStale()) return stale;

      consumed = true;

      const attempted: AgentActivity[] = [];

      try {

        const execute = () => {
          if (prepared.assets.length) useEditorStore.setState(state => ({ assets: [...state.assets, ...prepared.assets] }));
          const results = ops.map((op, index) => {

          const event: AgentActivity = { id: `tool-${index}`, tool: op.op, label: describeAgentOp(op), status: "running" };

          attempted.push(event);

          emit(event);

          const result = applyAgentOp(op);

          if (!result.ok) throw new Error(result.error || result.summary);

          emit({ ...event, status: "complete", detail: result.summary });

          return result;

        });
          if (!ops.some(op => op.op === "undo" || op.op === "redo")) assertSelectionPreserved(before, useEditorStore.getState(), context);
          return results;
        };
        const historyNavigation = ops.length === 1 && (ops[0]!.op === "undo" || ops[0]!.op === "redo");
        const results = historyNavigation ? execute() : runAgentTransaction(execute);

        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("skyclip-agent-applied", {detail:{label:`Updated ${results.length} timeline edits`,itemIds:ops.flatMap(op=>"itemId" in op?[op.itemId]:"afterItemId" in op?[op.afterItemId]:[])}}));
        return { reply: historyNavigation ? ops[0]!.op === "undo" ? "Undid the previous edit. You can redo it." : "Restored the previous edit." : `Applied ${results.length} ${results.length === 1 ? "edit" : "edits"}. You can undo this batch from the timeline.`, source: "llm", results, modelUsed: planned.modelUsed || undefined };

      } catch (error) {

        attempted.forEach(event => emit({ ...event, status: "rolled-back", detail: "Batch rolled back; no edits were kept." }));

        return { reply: `${error instanceof Error ? error.message : "Could not apply edits."} No edits were kept.`, source: "error", results: [] };

      }

    };

    if (opts?.mode === "control") {
      const applied = apply();
      if (applied.source === "error" && !opts.signal?.aborted && (opts.repairAttempt || 0) < 1 && applied.reply.endsWith("No edits were kept.")) {
        emit({id:"repair",label:"Correct rejected edit",status:"running",detail:applied.reply});
        return runEditorAgent(projectId,
          `${message}\nThe previous tool batch was rejected and fully rolled back: ${applied.reply.slice(0,500)}. Read the current timeline and return a corrected plan using valid targets, timing and supported tools.`,
          {...opts,mentionedItemIds:context.selectedItemIds,repairAttempt:1,activityPrefix:`${opts.activityPrefix || ""}repair/`});
      }
      if (applied.source !== "llm" || !opts.verifyResult || opts.signal?.aborted || ops.some(op => op.op === "undo" || op.op === "redo")) return applied;
      const results = [...applied.results];
      // Each continuation reads fresh store state. A bounded loop avoids runaway
      // model repetition; hitting the boundary is reported as unfinished.
      for (let step = 1; step <= 6; step++) {
        if (opts.signal?.aborted) return {...applied, results, reply: "Stopped. Completed edits are kept; you can undo them."};
        emit({id:`review-${step}`,label:`Review and continue · step ${step}`,status:"running",detail:"Reading the updated timeline before deciding the next action"});
        const review = await runEditorAgent(projectId,
          `Continue the original task using the CURRENT timeline and captions. Original request: ${message}. Completed edits: ${results.slice(-16).map(r=>r.summary.slice(0,100)).join("; ")}. Return no ops only when the request is satisfied or explain what cannot be completed. Otherwise return the next concrete required edits. Do not repeat completed work, add optional decoration, or duplicate assets/transitions.`,
          {...opts,mentionedItemIds:context.selectedItemIds,verifyResult:false,repairAttempt:0,activityPrefix:`step-${step}/`,referenceImageUrl:null,referenceAsset:undefined});
        results.push(...review.results);
        const failed = review.source === "error" || review.source === "stopped" || review.source === "refuse_tts";
        emit({id:`review-${step}`,label:`Review and continue · step ${step}`,status:failed?"error":"complete",detail:review.reply});
        if (failed) return {...applied, source:review.source, results, reply:`Applied ${results.length} edits. The remaining work stopped: ${review.reply}`};
        if (!review.results.length) return {...applied, results, reply:`Applied ${results.length} edits. ${review.reply}`};
      }
      return {...applied, results, reply:`Applied ${results.length} edits. The agent reached this run's continuation limit before confirming completion. Review the changes and ask to continue for the remaining work.`};

    }
    return {

      reply: planned.reply || "Here’s the edit plan. Review it before applying.", source: "llm", results: [],

      plannedChanges: ops.map(describeAgentOp), approve: apply, modelUsed: planned.modelUsed || undefined,

    };

  } catch (error) {

    if (error instanceof InvalidAgentPlanError && opts?.mode === "control" && !opts.signal?.aborted && !isStale() && (opts.repairAttempt || 0) < 1) {
      emit({id:"repair-validation",label:"Correct invalid tool arguments",status:"running",detail:"The plan did not pass editor validation; no edits were applied."});
      return runEditorAgent(projectId, `${message}\nThe editor rejected the plan before applying edits. ${error.message}. Correct the arguments using supported tools and return the complete corrected plan.`, {...opts,repairAttempt:1,activityPrefix:`${opts.activityPrefix || ""}repair/`});
    }
    const cancelled = opts?.signal?.aborted;

    const reply = cancelled ? stopped.reply : error instanceof InvalidAgentPlanError ? "The AI plan still contains invalid editing instructions after correction. No edits were applied." : error instanceof Error ? error.message : "AI editing failed. No edits were applied.";

    emit({ id: phase, label: cancelled ? "Stopped" : "Could not complete request", status: cancelled ? "cancelled" : "error", detail: reply });

    return { reply, source: cancelled ? "stopped" : "error", results: [] };

  }

}
