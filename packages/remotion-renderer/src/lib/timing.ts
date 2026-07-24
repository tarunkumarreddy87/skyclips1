/**
 * Shared timing helpers for timeline.v1 → Remotion frames.
 * Absolute start_sec / duration_sec are the SSOT (ADR 0007 / 0009).
 * There is no separate toAbsoluteTimeline — do not invent relative clocks here.
 */

import type { TimelineManifestV1, Transition, VideoClip } from "./types";

export function secToFrames(sec: number, fps: number): number {
  return Math.max(1, Math.round(sec * fps));
}

/** Frame offset for a source trim. Unlike a clip duration, this may be frame zero. */
export function secToFrameOffset(sec: number, fps: number): number {
  return Math.max(0, Math.round(sec * fps));
}

export function framesToSec(frames: number, fps: number): number {
  return frames / fps;
}

/** Inclusive start frame for an absolute-timed clip. */
export function clipFromFrame(startSec: number, fps: number): number {
  return Math.max(0, Math.round(startSec * fps));
}

export function clipDurationFrames(durationSec: number, fps: number): number {
  return secToFrames(durationSec, fps);
}

function sortedVideos(manifest: TimelineManifestV1): VideoClip[] {
  return [...manifest.tracks.video].sort((a, b) => a.start_sec - b.start_sec);
}

function enabledTransitionMap(manifest: TimelineManifestV1): Map<string, Transition> {
  return new Map(
    (manifest.transitions ?? [])
      .filter((t) => t.enabled !== false && t.type !== "cut" && t.duration_sec > 0)
      .map((t) => [t.after_clip_id, t]),
  );
}

/**
 * Map editor absolute time → Remotion TransitionSeries export clock.
 * Each non-cut transition between consecutive A-roll clips shortens the export
 * by its duration once we pass the next clip's editor start.
 */
export function mapEditorSecToExportSec(
  editorSec: number,
  manifest: TimelineManifestV1,
): number {
  const videos = sortedVideos(manifest);
  if (videos.length < 2) return Math.max(0, editorSec);
  const byAfter = enabledTransitionMap(manifest);
  let subtract = 0;
  for (let i = 0; i < videos.length - 1; i++) {
    const tr = byAfter.get(videos[i].id);
    if (!tr) continue;
    const nextStart = videos[i + 1].start_sec;
    if (editorSec >= nextStart) {
      subtract += tr.duration_sec;
    }
  }
  return Math.max(0, editorSec - subtract);
}

/** Map an editor [start, start+duration] interval onto the compressed export clock. */
export function mapEditorIntervalToExport(
  startSec: number,
  durationSec: number,
  manifest: TimelineManifestV1,
): { startSec: number; durationSec: number } {
  const endSec = startSec + Math.max(0, durationSec);
  const mappedStart = mapEditorSecToExportSec(startSec, manifest);
  const mappedEnd = mapEditorSecToExportSec(endSec, manifest);
  return {
    startSec: mappedStart,
    durationSec: Math.max(1 / 30, mappedEnd - mappedStart),
  };
}

/**
 * TransitionSeries shortens the timeline by each transition duration.
 * Prefer this over metadata.duration_sec when composition length must match xfade output.
 */
export function transitionSeriesDurationFrames(
  manifest: TimelineManifestV1,
  fps: number,
): number {
  const videos = sortedVideos(manifest);
  if (!videos.length) {
    return secToFrames(manifest.metadata.duration_sec, fps);
  }
  const byAfter = enabledTransitionMap(manifest);
  let frames = 0;
  videos.forEach((clip, i) => {
    frames += clipDurationFrames(clip.duration_sec, fps);
    if (i < videos.length - 1) {
      const tr = byAfter.get(clip.id);
      if (tr) {
        frames -= secToFrames(tr.duration_sec, fps);
      }
    }
  });
  return Math.max(1, frames);
}
