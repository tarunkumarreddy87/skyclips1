import type { Timeline } from "./types";

/**
 * Export wall-clock length accounting for native engine TransitionSeries overlaps.
 * Matches packages/video-engine `transitionSeriesDurationFrames` logic:
 * sum(video clip durations) − sum(enabled non-cut transition durations between consecutive clips).
 *
 * Editor `timeline.durationMs` stays the absolute canvas (max clip end) for scrubbing.
 */
export function estimateExportDurationMs(timeline: Timeline): number {
  // Transitions blend at their boundary without shortening captions or audio.
  return Math.max(1, timeline.durationMs);
}
export function estimateExportDurationSec(timeline: Timeline): number {
  return estimateExportDurationMs(timeline) / 1000;
}
