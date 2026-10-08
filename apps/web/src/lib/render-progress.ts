/** Worker events use overall pipeline progress: native export occupies 85–99%.
 * Inverting its rounded value gives an approximate export percentage, rather
 * than showing the completed generation work as completed video encoding.
 */
export function renderStagePercent(overallPercent: number | null | undefined): number {
  if (overallPercent == null || !Number.isFinite(overallPercent)) return 0;
  if (overallPercent >= 100) return 100;
  return Math.min(99, Math.max(0, Math.round(((overallPercent - 85) / 14) * 100)));
}
