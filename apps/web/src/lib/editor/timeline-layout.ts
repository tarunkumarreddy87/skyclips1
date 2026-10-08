import type { Track, TrackType } from "./types";

/** Premium timeline dimensions — denser stack closer to RVE / VEED. */
export const TIMELINE_LABEL_WIDTH = 28;
export const TIMELINE_RULER_HEIGHT = 24;
export const TIMELINE_CONTROLS_HEIGHT = 58;
export const TIMELINE_TRACK_GAP = 2;

export const TRACK_HEIGHT_BY_TYPE: Record<TrackType, number> = {
  captions: 26,
  text: 24,
  video: 40,
  broll: 32,
  animation: 24,
  narration: 28,
  music: 28,
  sfx: 24,
};

/** Display order: captions sit on video cuts (Pictory / VidRush scene stack). */
export const TRACK_DISPLAY_ORDER: TrackType[] = [
  "captions",
  "video",
  "broll",
  "narration",
  "music",
  "text",
  "animation",
  "sfx",
];

/** Always keep these rows even when empty so the editor never feels "missing" core lanes. */
export const TRACK_ALWAYS_VISIBLE: ReadonlySet<TrackType> = new Set([
  "captions",
  "video",
  "narration",
  "music",
]);

export function trackRowHeight(type: TrackType): number {
  return TRACK_HEIGHT_BY_TYPE[type] ?? 28;
}

const layoutCache = new WeakMap<Track, { height: number; offsets: Map<string, number> }>();

/** Pack simultaneous clips into visible sub-lanes without changing their timing or layer order. */
export function layoutTrack(track: Track): { height: number; offsets: Map<string, number> } {
  const cached = layoutCache.get(track);
  if (cached) return cached;
  const rowHeight = trackRowHeight(track.type);
  const rowEnds: number[] = [];
  const offsets = new Map<string, number>();
  for (const item of [...track.items].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))) {
    let row = rowEnds.findIndex((end) => end <= item.startMs);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = item.endMs;
    offsets.set(item.id, row * (rowHeight + TIMELINE_TRACK_GAP));
  }
  const rows = Math.max(1, rowEnds.length);
  const result = { height: rows * rowHeight + (rows - 1) * TIMELINE_TRACK_GAP, offsets };
  layoutCache.set(track, result);
  return result;
}

export const TRACK_META: Record<
  TrackType,
  { short: string; accent: string; accentSoft: string }
> = {
  captions: {
    short: "Captions",
    accent: "#7DD3FC",
    accentSoft: "rgba(125,211,252,0.16)",
  },
  text: {
    short: "Text",
    accent: "#A78BFA",
    accentSoft: "rgba(167,139,250,0.16)",
  },
  video: {
    short: "Scenes",
    accent: "#60A5FA",
    accentSoft: "rgba(96,165,250,0.14)",
  },
  broll: {
    short: "B-roll",
    accent: "#34D399",
    accentSoft: "rgba(52,211,153,0.14)",
  },
  animation: {
    short: "Motion",
    accent: "#A78BFA",
    accentSoft: "rgba(167,139,250,0.16)",
  },
  narration: {
    short: "Voice",
    accent: "#FBBF24",
    accentSoft: "rgba(251,191,36,0.16)",
  },
  music: {
    short: "Music",
    accent: "#F97316",
    accentSoft: "rgba(249,115,22,0.16)",
  },
  sfx: {
    short: "SFX",
    accent: "#FB923C",
    accentSoft: "rgba(251,146,60,0.14)",
  },
};

/** Ordered visible tracks — hide empty optional lanes unless showAll.
 * `track.hidden` only affects preview (mute/hide content), not whether the row appears —
 * so the eye control can always un-hide.
 * Optional `trackOrder` overrides the default TRACK_DISPLAY_ORDER for lane stacking.
 */
export function resolveVisibleTracks(
  tracks: Track[],
  showAllTracks: boolean,
  trackOrder?: TrackType[],
): Track[] {
  const baseOrder = trackOrder?.length ? trackOrder : TRACK_DISPLAY_ORDER;
  // Append any track types missing from a custom order so lanes never vanish.
  const order = [...new Set(baseOrder)];
  for (const type of TRACK_DISPLAY_ORDER) {
    if (!order.includes(type)) order.push(type);
  }
  const ordered: Track[] = [];
  for (const type of order) {
    for (const track of tracks.filter((candidate) => candidate.type === type)) {
      const hasItems = track.items.length > 0;
      if (!showAllTracks && !hasItems && !TRACK_ALWAYS_VISIBLE.has(type)) continue;
      ordered.push(track);
    }
  }
  return ordered;
}

/** Video cut times (ms) for vertical guides — captions align to these. */
export function collectVideoCutMs(tracks: Track[]): number[] {
  const video = tracks.find((t) => t.type === "video");
  if (!video) return [];
  const cuts = new Set<number>();
  for (const item of video.items) {
    if (item.hidden) continue;
    cuts.add(Math.round(item.startMs));
    cuts.add(Math.round(item.endMs));
  }
  return [...cuts].sort((a, b) => a - b);
}
