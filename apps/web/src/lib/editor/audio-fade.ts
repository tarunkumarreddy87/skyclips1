/** Preview gain curve matching export afade (linear in/out). */
export function fadedGain(
  localMs: number,
  durationMs: number,
  baseGain: number,
  fadeInMs = 0,
  fadeOutMs = 0,
): number {
  if (baseGain <= 0 || durationMs <= 0) return 0;
  let g = baseGain;
  const fi = Math.max(0, fadeInMs);
  const fo = Math.max(0, fadeOutMs);
  if (fi > 0 && localMs < fi) {
    g *= localMs / fi;
  }
  if (fo > 0 && localMs > durationMs - fo) {
    const rem = Math.max(0, durationMs - localMs);
    g *= rem / fo;
  }
  return Math.max(0, Math.min(1, g));
}
