import { clamp } from "./utils";

const DEFAULT_THRESHOLD_MS = 120;

/** ~8px of timeline time; tighter when zoomed in, looser when zoomed out. */
export function snapThresholdMs(zoom: number): number {
  const z = Math.max(1, zoom);
  return Math.max(40, Math.min(220, Math.round(8000 / z)));
}

export function collectSnapPoints(
  tracks: { items: { startMs: number; endMs: number; id: string }[] }[],
  playheadMs: number,
  excludeItemId?: string,
): number[] {
  const points = new Set<number>([0, playheadMs]);
  for (const track of tracks) {
    for (const item of track.items) {
      if (item.id === excludeItemId) continue;
      points.add(item.startMs);
      points.add(item.endMs);
    }
  }
  return [...points].sort((a, b) => a - b);
}

export function snapTime(
  ms: number,
  snapPoints: number[],
  enabled: boolean,
  thresholdMs = DEFAULT_THRESHOLD_MS,
): number {
  if (!enabled) return ms;
  let best = ms;
  let bestDist = thresholdMs + 1;
  for (const point of snapPoints) {
    const dist = Math.abs(point - ms);
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return bestDist <= thresholdMs ? best : ms;
}

export function snapDuration(
  startMs: number,
  endMs: number,
  minDurationMs: number,
  maxEndMs: number,
): { startMs: number; endMs: number } {
  const maxEnd = Math.max(minDurationMs, maxEndMs);
  let start = startMs;
  let end = endMs;
  // Keep the opposite edge stable — never relocate the clip when a trim overshoots.
  if (end - start < minDurationMs) {
    if (start > end - minDurationMs) {
      start = Math.max(0, end - minDurationMs);
    }
    if (end < start + minDurationMs) {
      end = Math.min(maxEnd, start + minDurationMs);
    }
  }
  start = clamp(start, 0, Math.max(0, maxEnd - minDurationMs));
  end = clamp(end, start + minDurationMs, maxEnd);
  return { startMs: start, endMs: end };
}
