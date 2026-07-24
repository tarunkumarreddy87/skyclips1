import type { TextItem, TimelineItem, Track } from "./types";
import { captionsForSectionWindow, estimateWordTimings } from "@hanuman/shared-types";

export interface CaptionTimelineGroup {
  /** Stable key for React + selection highlighting. */
  id: string;
  sectionId: string;
  startMs: number;
  endMs: number;
  items: TextItem[];
  previewText: string;
}

/** Derive a section key for grouping (prefer explicit sectionId). */
export function captionSectionKey(item: TextItem): string {
  if (item.sectionId?.trim()) return item.sectionId.trim();
  // caption-scene-intro-0 → scene-intro
  const m = /^caption-(.+?)-\d+$/.exec(item.id);
  if (m?.[1]) return m[1];
  // captions-<uuid> agent clips — alone in their own bucket
  return item.id;
}

/**
 * Collapse many phrase caption clips into readable section-level blocks
 * for the timeline lane. Underlying items are preserved untouched.
 */
export function groupCaptionsForTimeline(items: TimelineItem[]): CaptionTimelineGroup[] {
  const captions = items
    .filter((i): i is TextItem => i.type === "captions" && !i.hidden)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const bySection = new Map<string, TextItem[]>();
  for (const cap of captions) {
    const key = captionSectionKey(cap);
    const list = bySection.get(key) ?? [];
    list.push(cap);
    bySection.set(key, list);
  }

  const groups: CaptionTimelineGroup[] = [];
  for (const [sectionId, list] of bySection) {
    const sorted = list.slice().sort((a, b) => a.startMs - b.startMs);
    const startMs = Math.min(...sorted.map((c) => c.startMs));
    const endMs = Math.max(...sorted.map((c) => c.endMs));
    const first = sorted[0]?.text?.trim() ?? "";
    const last = sorted.length > 1 ? sorted[sorted.length - 1]?.text?.trim() ?? "" : "";
    const preview =
      sorted.length === 1
        ? first
        : first.length > 36
          ? `${first.slice(0, 36)}…`
          : last
            ? `${first} · ${sorted.length} lines`
            : first;

    groups.push({
      id: `cap-group-${sectionId}`,
      sectionId,
      startMs,
      endMs,
      items: sorted,
      previewText: preview || `${sorted.length} captions`,
    });
  }

  return groups.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Timeline-only presentation: one continuous transcript lane spanning the
 * real caption cues (not the full project duration).
 */
export function combineCaptionsForTimeline(
  items: TimelineItem[],
  _durationMs?: number,
): CaptionTimelineGroup | null {
  const captions = items
    .filter((item): item is TextItem => item.type === "captions" && !item.hidden)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (!captions.length) return null;
  const startMs = captions[0]!.startMs;
  const endMs = Math.max(...captions.map((c) => c.endMs));
  const first = captions[0]?.text?.trim() ?? "";
  return {
    id: "caption-continuous-lane",
    sectionId: "caption-continuous-lane",
    startMs,
    endMs: Math.max(startMs + 1, endMs),
    items: captions,
    previewText:
      captions.length === 1
        ? first || "Captions"
        : `Captions · ${captions.length}`,
  };
}

/**
 * Drop near-duplicate overlapping captions (e.g. agent insert vs pipeline chunk).
 * Keeps the earlier / pipeline (`caption-scene-*`) clip when text overlaps heavily.
 */
export function dedupeOverlappingCaptions(items: TextItem[]): TextItem[] {
  const sorted = items
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const kept: TextItem[] = [];

  for (const cand of sorted) {
    const conflict = kept.find((k) => {
      const overlap = Math.min(k.endMs, cand.endMs) - Math.max(k.startMs, cand.startMs);
      if (overlap <= 0) return false;
      const shorter = Math.min(k.endMs - k.startMs, cand.endMs - cand.startMs);
      if (shorter <= 0) return false;
      const ratio = overlap / shorter;
      if (ratio < 0.45) return false;
      const a = k.text.trim().toLowerCase();
      const b = cand.text.trim().toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });
    if (!conflict) {
      kept.push(cand);
      continue;
    }
    // Prefer caption-scene-* (pipeline) over captions-* (agent)
    const candPreferred =
      cand.id.startsWith("caption-scene-") && !conflict.id.startsWith("caption-scene-");
    if (candPreferred) {
      const idx = kept.indexOf(conflict);
      kept[idx] = cand;
    }
  }
  return kept;
}

/**
 * Re-chunk each section's captions to speech-aware display windows + word clocks.
 * Use when source narration is complete (pipeline manifest), not truncated UI text.
 */
export function realignCaptionsToSpeechLayout(items: TextItem[]): TextItem[] {
  const deduped = dedupeOverlappingCaptions(items);
  const groups = groupCaptionsForTimeline(deduped);
  const out: TextItem[] = [];

  for (const group of groups) {
    const styleSrc = group.items[0]!;
    const narration = group.items
      .map((c) => String(c.text || "").trim())
      .filter(Boolean)
      .join(" ");
    if (!narration) continue;
    const startSec = group.startMs / 1000;
    const durationSec = Math.max(0.35, (group.endMs - group.startMs) / 1000);
    const chunks = captionsForSectionWindow({
      narration,
      startSec,
      durationSec,
      sectionId: group.sectionId,
      clipId: `scene-${group.sectionId}`,
    });
    for (const chunk of chunks) {
      out.push({
        ...styleSrc,
        id: chunk.id,
        type: "captions",
        startMs: Math.round(chunk.start_sec * 1000),
        endMs: Math.round((chunk.start_sec + chunk.duration_sec) * 1000),
        label:
          chunk.text.length > 24 ? `${chunk.text.slice(0, 24)}…` : chunk.text,
        text: chunk.text,
        sectionId: group.sectionId,
        // Deep-clone layout so moving one cue never mutates siblings.
        position: { ...(styleSrc.position ?? { x: 50, y: 84 }) },
        transform: styleSrc.transform
          ? { ...styleSrc.transform }
          : {
              x: styleSrc.position?.x ?? 50,
              y: styleSrc.position?.y ?? 84,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              zIndex: 20,
            },
        boxWidthPct: styleSrc.boxWidthPct ?? 72,
        words: chunk.words.map((w) => ({
          text: w.text,
          startSec: w.start_sec,
          durationSec: w.duration_sec,
        })),
        hidden: false,
        selected: false,
      });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Refresh karaoke word clocks in place (punctuation-aware).
 * Safe for saved editor docs — does not re-join truncated caption text.
 * Also realigns drifted word blocks so on-screen text tracks the narration.
 */
export function refreshCaptionWordClocks(items: TextItem[]): TextItem[] {
  return items.map((item) => {
    if (item.type !== "captions") return item;
    const startSec = item.startMs / 1000;
    const durationSec = Math.max(0.04, (item.endMs - item.startMs) / 1000);
    const endSec = startSec + durationSec;

    if (item.words && item.words.length > 0) {
      const first = item.words[0]!.startSec;
      const delta = startSec - first;
      // Word clocks often drift after trim/move — snap the block to the clip window.
      if (Math.abs(delta) > 0.04) {
        return {
          ...item,
          words: item.words.map((w) => ({
            ...w,
            startSec: w.startSec + delta,
          })),
        };
      }
      const last = item.words[item.words.length - 1]!;
      const lastEnd = last.startSec + last.durationSec;
      // If words overrun/underrun the cue badly, rebuild from text for this window.
      if (lastEnd < startSec + 0.05 || first > endSec - 0.05) {
        const words = estimateWordTimings(item.text || "", startSec, durationSec);
        return {
          ...item,
          words: words.map((w) => ({
            text: w.text,
            startSec: w.start_sec,
            durationSec: w.duration_sec,
          })),
        };
      }
      return item;
    }

    const words = estimateWordTimings(item.text || "", startSec, durationSec);
    return {
      ...item,
      words: words.map((w) => ({
        text: w.text,
        startSec: w.start_sec,
        durationSec: w.duration_sec,
      })),
    };
  });
}

/** Apply in-place word-clock refresh to a full timeline. */
export function withRefreshedCaptionWordClocks<T extends { tracks: Track[] }>(
  timeline: T,
): T {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      if (track.type !== "captions") return track;
      const captions = track.items.filter((i): i is TextItem => i.type === "captions");
      if (!captions.length) return track;
      return { ...track, items: refreshCaptionWordClocks(captions) };
    }),
  };
}
