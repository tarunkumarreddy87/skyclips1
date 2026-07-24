/** Shared helpers for video-track transition seams (timeline + Remotion preview). */

/** Max gap (ms) still treated as an abutting cut for transition UI / blends. */
export const TRANSITION_ABUT_EPSILON_MS = 80;

export function clipsAbut(
  earlierEndMs: number,
  laterStartMs: number,
  epsilonMs = TRANSITION_ABUT_EPSILON_MS,
): boolean {
  return Math.abs(laterStartMs - earlierEndMs) <= epsilonMs;
}

export function clipsAbutSec(
  earlierEndSec: number,
  laterStartSec: number,
  epsilonSec = TRANSITION_ABUT_EPSILON_MS / 1000,
): boolean {
  return Math.abs(laterStartSec - earlierEndSec) <= epsilonSec;
}
