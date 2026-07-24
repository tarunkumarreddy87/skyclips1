/**
 * Remotion Audio volume helper — clip volume × bus × fade envelopes × optional duck.
 * Frame `f` is local to the Sequence (0 … durationInFrames-1).
 */

export function audioVolumeAtFrame(opts: {
  frame: number;
  durationInFrames: number;
  fps: number;
  clipVolume?: number;
  busVolume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** Extra multiplier (e.g. music duck under narration). */
  duck?: number;
}): number {
  const clip = Math.max(0, Math.min(1, opts.clipVolume ?? 1));
  const bus = Math.max(0, Math.min(1, opts.busVolume ?? 1));
  const duck = Math.max(0, Math.min(1, opts.duck ?? 1));
  let gain = clip * bus * duck;
  if (gain <= 0 || opts.durationInFrames <= 0) return 0;

  const fadeInFrames = Math.max(0, Math.round((opts.fadeInSec ?? 0) * opts.fps));
  const fadeOutFrames = Math.max(0, Math.round((opts.fadeOutSec ?? 0) * opts.fps));
  const f = opts.frame;

  if (fadeInFrames > 0 && f < fadeInFrames) {
    gain *= f / fadeInFrames;
  }
  if (fadeOutFrames > 0 && f > opts.durationInFrames - fadeOutFrames) {
    const left = opts.durationInFrames - f;
    gain *= Math.max(0, left / fadeOutFrames);
  }
  return Math.max(0, Math.min(1, gain));
}

/** True when any narration clip covers absolute time (seconds). */
export function narrationCoversSec(
  nowSec: number,
  narration: { start_sec: number; duration_sec: number }[],
): boolean {
  return narration.some(
    (a) => nowSec >= a.start_sec && nowSec < a.start_sec + a.duration_sec,
  );
}

/** Music duck factor when narration is speaking (0.2 ≈ −14 dB-ish). */
export const MUSIC_DUCK_UNDER_NARRATION = 0.22;
