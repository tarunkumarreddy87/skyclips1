import type { ArtifactResponse, GenerationRun, ProgressEvent } from "@/lib/api-client";
import { renderStagePercent } from "@/lib/render-progress";

export interface VideoResultState {
  run: GenerationRun | null;
  video: ArtifactResponse | null;
  error: string | null;
  percent: number | null;
}

export const initialVideoResultState: VideoResultState = {
  run: null, video: null, error: null, percent: null,
};

type Action =
  | { type: "run"; run: GenerationRun | null; percent?: number }
  | { type: "progress"; event: ProgressEvent }
  | { type: "video"; runId: string | null; video: ArtifactResponse }
  | { type: "error"; runId: string | null; message: string; retry?: boolean };

export function isRendering(run: GenerationRun | null): boolean {
  return run?.status === "running" || run?.status === "queued";
}

export function videoResultReducer(state: VideoResultState, action: Action): VideoResultState {
  switch (action.type) {
    case "run": {
      const run = action.run;
      const sameRun = state.run?.id === run?.id;
      const failed = run?.status === "failed" || run?.status === "cancelled";
      return {
        run,
        video: run?.status === "completed" && state.video?.runId === run.id ? state.video : null,
        error: failed
          ? run.errorMessage || (sameRun ? state.error : null) ||
            (run.status === "cancelled" ? "Render cancelled" : "Render failed")
          : null,
        percent: action.percent ?? (sameRun ? state.percent : null),
      };
    }
    case "progress":
      if (action.event.runId !== state.run?.id) return state;
      return {
        ...state,
        percent: action.event.stage === "enqueue_render" && action.event.percent != null
          ? renderStagePercent(action.event.percent) : state.percent,
        error: action.event.status === "failed"
          ? action.event.message || "Render failed"
          : state.error,
      };
    case "video":
      // A completed request from a prior export must never replace the latest run.
      if (action.runId !== (state.run?.id ?? null) ||
          (action.video.runId ?? null) !== action.runId ||
          (state.run && state.run.status !== "completed")) return state;
      return { ...state, video: action.video, error: null };
    case "error":
      if (action.runId !== (state.run?.id ?? null)) return state;
      // Download errors are secondary to the renderer's recorded failure.
      if (!action.retry && (state.run?.status === "failed" || state.run?.status === "cancelled")) return state;
      return { ...state, error: action.message };
  }
}
