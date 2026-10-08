/** Cut only the unavailable tail, preserving the rest of the timeline clock. */
export function playableVideoEnd(startMs: number, endMs: number, sourceStartMs: number, durationSec: number, fps: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || fps <= 0) return endMs;
  const availableMs = Math.floor(durationSec * fps) * 1000 / fps - sourceStartMs;
  if (availableMs < 1000 / fps) return endMs;
  return Math.min(endMs, startMs + availableMs);
}
