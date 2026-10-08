/**
 * Horizontal windowing for timeline lanes.
 * Clips are absolutely positioned, so offscreen items can be skipped entirely
 * (no spacer DOM). Overscan is applied by the scroll listener via viewRangeMs.
 */

export type TimeRange = { startMs: number; endMs: number };

/** True when [startMs, endMs) intersects the visible scroll window. */
export function clipIntersectsView(
  startMs: number,
  endMs: number,
  view: TimeRange,
): boolean {
  return endMs >= view.startMs && startMs <= view.endMs;
}

/** Filter items that intersect the visible time window (± overscan already in view). */
export function filterItemsInView<T extends TimeRange>(
  items: readonly T[],
  view: TimeRange,
): T[] {
  if (items.length === 0) return [];
  return items.filter((i) => clipIntersectsView(i.startMs, i.endMs, view));
}
