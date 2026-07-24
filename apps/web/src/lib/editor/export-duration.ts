import type { Timeline, TransitionItem } from "./types";

/**
 * Export wall-clock length accounting for Remotion TransitionSeries overlaps.
 * Matches packages/remotion-renderer `transitionSeriesDurationFrames` logic:
 * sum(video clip durations) − sum(enabled non-cut transition durations between consecutive clips).
 *
 * Editor `timeline.durationMs` stays the absolute canvas (max clip end) for scrubbing.
 */
export function estimateExportDurationMs(timeline: Timeline): number {
  const videoTrack = timeline.tracks.find((t) => t.type === "video" && !t.hidden);
  const clips = [...(videoTrack?.items ?? [])]
    .filter((i) => !i.hidden && i.type === "video")
    .sort((a, b) => a.startMs - b.startMs);

  if (!clips.length) {
    return Math.max(1, timeline.durationMs);
  }

  const show = timeline.settings.showTransitions !== false;
  const byAfter = new Map<string, TransitionItem>();
  if (show) {
    for (const t of timeline.transitions) {
      if (t.enabled === false || t.transitionType === "cut" || t.durationMs <= 0) continue;
      byAfter.set(t.afterItemId, t);
    }
  }

  let ms = 0;
  clips.forEach((clip, i) => {
    ms += Math.max(0, clip.endMs - clip.startMs);
    if (i < clips.length - 1) {
      const tr = byAfter.get(clip.id);
      if (tr) ms -= tr.durationMs;
    }
  });

  // Prefer at least the compressed video track length; don't exceed absolute canvas.
  return Math.max(1, Math.min(timeline.durationMs, Math.round(ms)));
}

export function estimateExportDurationSec(timeline: Timeline): number {
  return estimateExportDurationMs(timeline) / 1000;
}
