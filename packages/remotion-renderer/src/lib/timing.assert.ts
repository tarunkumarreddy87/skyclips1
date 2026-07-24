/**
 * Quick node assert for editor→export clock (TransitionSeries overlap).
 * Run: pnpm exec tsx src/lib/timing.assert.ts
 */
import type { TimelineManifestV1 } from "./types";
import {
  mapEditorSecToExportSec,
  secToFrameOffset,
  transitionSeriesDurationFrames,
} from "./timing";

const manifest = {
  version: "1",
  metadata: {
    project_id: "p",
    run_id: "r",
    format_mode: "documentary",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    duration_sec: 20,
  },
  tracks: {
    video: [
      {
        id: "a",
        scene_id: "1",
        type: "video",
        src: "x",
        start_sec: 0,
        duration_sec: 10,
      },
      {
        id: "b",
        scene_id: "2",
        type: "video",
        src: "y",
        start_sec: 10,
        duration_sec: 10,
      },
    ],
    audio: [],
    captions: [],
  },
  transitions: [
    {
      id: "t1",
      after_clip_id: "a",
      type: "fade",
      duration_sec: 0.5,
      enabled: true,
    },
  ],
} as TimelineManifestV1;

const midB = mapEditorSecToExportSec(12, manifest);
if (Math.abs(midB - 11.5) > 0.001) {
  throw new Error(`expected 11.5 got ${midB}`);
}
const frames = transitionSeriesDurationFrames(manifest, 30);
if (frames !== Math.round(19.5 * 30)) {
  throw new Error(`expected ${Math.round(19.5 * 30)} frames got ${frames}`);
}
if (secToFrameOffset(0, 30) !== 0) {
  throw new Error("expected zero source offset to stay at frame zero");
}
console.log("timing.assert OK", { midB, frames });
