import type { TimelineItem, Track } from "./types";

/** Inclusive interval overlap (half-open [start, end)). */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Same-track clips that overlap the proposed [startMs, endMs) for `itemId`.
 * Used for live drag collision feedback (red highlight).
 */
export function findOverlappingClipIds(
  tracks: Track[],
  itemId: string,
  startMs: number,
  endMs: number,
  excludeIds?: ReadonlySet<string>,
): string[] {
  const track = tracks.find((t) => t.items.some((i) => i.id === itemId));
  if (!track) return [];
  const hits: string[] = [];
  for (const item of track.items) {
    if (item.id === itemId || item.hidden || excludeIds?.has(item.id)) continue;
    if (intervalsOverlap(startMs, endMs, item.startMs, item.endMs)) {
      hits.push(item.id);
    }
  }
  return hits;
}

export function proposedRangeForMove(
  item: TimelineItem,
  nextStartMs: number,
): { startMs: number; endMs: number } {
  const span = Math.max(1, item.endMs - item.startMs);
  return { startMs: nextStartMs, endMs: nextStartMs + span };
}
