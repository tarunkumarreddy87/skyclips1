import type { TimelineManifestV1 } from "@hanuman/shared-types";

export const ENGINE_VERSION = "hanuman-svg-1";

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

/** Absolute half-open windows: a scene ends exactly when the next starts. */
export function activeAt(clip: { start_sec: number; duration_sec: number }, timeSec: number): boolean {
  return timeSec >= clip.start_sec && timeSec < clip.start_sec + clip.duration_sec;
}

/** Transitions replace a clip's tail; they never shorten the authored timeline. */
export function timelineDurationSec(manifest: TimelineManifestV1): number {
  const clips = [
    ...manifest.tracks.video, ...manifest.tracks.audio, ...manifest.tracks.captions,
    ...(manifest.tracks.broll ?? []), ...(manifest.tracks.music ?? []),
    ...(manifest.overlays ?? []), ...(manifest.graphics ?? []),
  ];
  return Math.max(0.001, manifest.metadata.duration_sec,
    ...clips.map((clip) => clip.start_sec + clip.duration_sec));
}

export function timeForFrame(frame: number, fps: number): number {
  return Math.max(0, Math.floor(frame)) / Math.max(1, fps);
}
