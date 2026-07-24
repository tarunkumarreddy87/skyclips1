import { matchLocalIntent } from "./intent";
import { applyAgentOps, assertAllowedOp, type AgentOp, type AgentOpResult } from "./ops";
import { buildAgentContext } from "./context";
import { planEditorAgentOps } from "@/lib/api-client";

export interface AgentChatResult {
  reply: string;
  source: "local" | "llm" | "refuse_tts" | "error";
  results: AgentOpResult[];
}

export async function runEditorAgent(
  projectId: string,
  message: string,
  opts?: { speed?: "fast" | "smart" },
): Promise<AgentChatResult> {
  const local = matchLocalIntent(message);
  if (local.kind === "refuse_tts") {
    return { reply: local.reply, source: "refuse_tts", results: [] };
  }
  if (local.kind === "ops" && local.confidence >= 0.85) {
    const results = applyAgentOps(local.ops);
    const detail = results
      .map((r) => (r.ok ? `• ${r.summary}` : `• Failed: ${r.error || r.summary}`))
      .join("\n");
    return {
      reply: [local.reply, detail].filter(Boolean).join("\n"),
      source: "local",
      results,
    };
  }

  const context = buildAgentContext();
  try {
    const planned = await planEditorAgentOps(projectId, {
      message,
      speed: opts?.speed ?? "fast",
      context: {
        playheadMs: context.playheadMs,
        selectedItemId: context.selectedItemId,
        selectedTransitionId: context.selectedTransitionId,
        durationMs: context.durationMs,
        summary: context.summary,
      },
    });

    if (planned.refused) {
      return { reply: planned.reply, source: "refuse_tts", results: [] };
    }

    const ops: AgentOp[] = [];
    for (const raw of planned.ops || []) {
      const allowed = assertAllowedOp(raw);
      if (allowed) ops.push(allowed);
    }

    if (!ops.length) {
      return {
        reply:
          planned.reply ||
          "I couldn’t map that to an edit. Try a simpler command like “add a caption” or “use a glitch transition”.",
        source: "llm",
        results: [],
      };
    }

    const results = applyAgentOps(ops);
    const detail = results
      .map((r) => (r.ok ? `• ${r.summary}` : `• Failed: ${r.error || r.summary}`))
      .join("\n");
    return {
      reply: [planned.reply, detail].filter(Boolean).join("\n"),
      source: "llm",
      results,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Agent planning failed";
    if (local.kind === "ops" && local.ops.length) {
      const results = applyAgentOps(local.ops);
      return {
        reply: `${local.reply}\n(LLM unavailable — applied local match.)\n${results.map((r) => `• ${r.summary}`).join("\n")}`,
        source: "local",
        results,
      };
    }
    return {
      reply: `Couldn’t reach the planning API (${msg}). Try a simple command like “add caption”, “add music”, or “glitch transition”.`,
      source: "error",
      results: [],
    };
  }
}
