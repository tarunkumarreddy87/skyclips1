import assert from "node:assert/strict";
import test from "node:test";
import type { ArtifactResponse, GenerationRun, ProgressEvent } from "@/lib/api-client";
import { initialVideoResultState, isRendering, videoResultReducer as reduce } from "./video-result-state";
import { renderStagePercent } from "@/lib/render-progress";

const run = (id: string, status: string, errorMessage?: string): GenerationRun =>
  ({ id, status, errorMessage, projectId: "project", quoteId: "quote" });
const video = (runId: string): ArtifactResponse =>
  ({ id: `video-${runId}`, runId, projectId: "project", type: "final_video", downloadUrl: "/video.mp4", contentType: "video/mp4" });

test("opening a failed run shows its recorded renderer error", () => {
  const state = reduce(initialVideoResultState, { type: "run", run: run("current", "failed", "Incoming frame rate is invalid") });
  assert.equal(state.error, "Incoming frame rate is invalid");
  assert.equal(state.video, null);
  assert.equal(reduce(state, { type: "error", runId: "current", message: "Final video not found" }).error, state.error);
});

test("status polling reveals a failure even when the progress event was missed", () => {
  const active = reduce(initialVideoResultState, { type: "run", run: run("current", "running") });
  const failed = reduce(active, { type: "run", run: run("current", "failed", "Encoder stopped") });
  assert.equal(failed.error, "Encoder stopped");
  assert.equal(isRendering(failed.run), false);
});

test("a new queued or running export clears the previous video and shows progress", () => {
  let state = reduce(initialVideoResultState, { type: "run", run: run("old", "completed") });
  state = reduce(state, { type: "video", runId: "old", video: video("old") });
  assert.equal(state.video?.runId, "old");
  for (const status of ["queued", "running"]) {
    const next = reduce(state, { type: "run", run: run("current", status) });
    assert.equal(next.video, null);
    assert.equal(isRendering(next.run), true);
    assert.equal(next.error, null);
  }
});

test("late old downloads and progress cannot overwrite the current export", () => {
  const state = reduce(initialVideoResultState, { type: "run", run: run("current", "completed") });
  assert.equal(reduce(state, { type: "video", runId: "old", video: video("old") }), state);
  assert.equal(reduce(state, { type: "video", runId: "current", video: video("old") }), state);
  assert.equal(reduce(state, { type: "error", runId: "old", message: "Old download failed" }), state);
  const event = { runId: "old", status: "failed", message: "Old render failed", percent: 92 } as ProgressEvent;
  assert.equal(reduce(state, { type: "progress", event }), state);
  const current = reduce(state, { type: "video", runId: "current", video: video("current") });
  assert.equal(current.video?.runId, "current");
});

test("cancellation and retry-start failures remain visible", () => {
  const cancelled = reduce(initialVideoResultState, { type: "run", run: run("current", "cancelled") });
  assert.equal(cancelled.error, "Render cancelled");
  const failed = reduce(initialVideoResultState, { type: "run", run: run("current", "failed", "Original render failed") });
  assert.equal(reduce(failed, { type: "error", runId: "current", retry: true, message: "Retry service unavailable" }).error,
    "Retry service unavailable");
});

test("export UI uses render progress rather than completed generation progress", () => {
  assert.equal(renderStagePercent(85), 0);
  assert.equal(renderStagePercent(92), 50);
  assert.equal(renderStagePercent(99), 99);
  assert.equal(renderStagePercent(100), 100);
  assert.equal(renderStagePercent(undefined), 0);
  assert.equal(renderStagePercent(Number.NaN), 0);
  let state = reduce(initialVideoResultState, { type: "run", run: run("current", "running") });
  state = reduce(state, { type: "progress", event: { runId: "current", stage: "enqueue_render", status: "started", percent: 92 } as ProgressEvent });
  assert.equal(state.percent, 50);
  assert.equal(isRendering(state.run), true);
});
