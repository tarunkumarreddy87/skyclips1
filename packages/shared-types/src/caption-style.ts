/**
 * Project-level caption / subtitle styles (shared by editor preview + Remotion).
 * Karaoke uses proportional word timings when TTS word clocks aren't available.
 */

export type CaptionStyleId = "bold_static" | "karaoke" | "boxed_pill";

export const CAPTION_STYLE_IDS: CaptionStyleId[] = [
  "bold_static",
  "karaoke",
  "boxed_pill",
];

export const DEFAULT_CAPTION_STYLE: CaptionStyleId = "bold_static";

export interface CaptionStyleMeta {
  id: CaptionStyleId;
  label: string;
  description: string;
  /** Swatch for the picker. */
  swatch: string;
}

export const CAPTION_STYLE_META: Record<CaptionStyleId, CaptionStyleMeta> = {
  bold_static: {
    id: "bold_static",
    label: "Bold",
    description: "One phrase at a time, bold outline — classic documentary burn-in",
    swatch: "linear-gradient(135deg,#111,#333)",
  },
  karaoke: {
    id: "karaoke",
    label: "Karaoke",
    description: "Words fill progressively as they are spoken",
    swatch: "linear-gradient(90deg,#f59e0b 40%,#fff 40%)",
  },
  boxed_pill: {
    id: "boxed_pill",
    label: "Boxed",
    description: "Active word gets a high-contrast pill highlight",
    swatch: "linear-gradient(135deg,#0ea5e9,#0369a1)",
  },
};

export interface CaptionWordTiming {
  text: string;
  /** Absolute start on the timeline (seconds). */
  start_sec: number;
  duration_sec: number;
}

/** Normalize / validate a caption_style string from settings or UI. */
export function resolveCaptionStyleId(
  raw: string | null | undefined,
): CaptionStyleId {
  if (raw && (CAPTION_STYLE_IDS as string[]).includes(raw)) {
    return raw as CaptionStyleId;
  }
  // Legacy preview preset aliases
  if (raw === "bold" || raw === "outline" || raw === "minimal" || raw === "modern") {
    return raw === "modern" || raw === "minimal" ? "bold_static" : "bold_static";
  }
  if (raw === "neon" || raw === "gradient") return "boxed_pill";
  return DEFAULT_CAPTION_STYLE;
}

/** Spoken weight — mirrors workers/orchestrator caption_chunks.word_speak_weight. */
export function wordSpeakWeight(word: string): number {
  const w = String(word || "");
  const core = w.replace(/[^\p{L}\p{N}]+/gu, "");
  let base = Math.max(1, core.length || w.length);
  if (/[.!?…]["'”’)]?$/u.test(w)) base += 4;
  else if (/[,;:—–-]["'”’)]?$/u.test(w)) base += 2;
  if (/\d/u.test(w)) base += 2;
  if (core.length <= 2) base = Math.max(base, 1.5);
  return base;
}

/**
 * Build word clocks for Karaoke / boxed_pill when the caption has no words[].
 * Punctuation-aware weights track TTS cadence better than plain char length.
 * Sum of durations is forced to equal durationSec so preview/Remotion stay locked
 * to the caption clip window (not independent clocks).
 */
export function estimateWordTimings(
  text: string,
  startSec: number,
  durationSec: number,
): CaptionWordTiming[] {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || durationSec <= 0) return [];

  const weights = words.map((w) => wordSpeakWeight(w));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = startSec;
  let used = 0;
  const out: CaptionWordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const isLast = i === words.length - 1;
    const dur = isLast
      ? Math.max(0.04, durationSec - used)
      : Math.max(0.04, (durationSec * weights[i]!) / total);
    out.push({ text: words[i]!, start_sec: cursor, duration_sec: dur });
    cursor += dur;
    used += dur;
  }
  return out;
}

export function wordsForCaption(opts: {
  text: string;
  startSec: number;
  durationSec: number;
  words?: CaptionWordTiming[] | null;
  /**
   * Editor-absolute start of the caption clip that authored `words`.
   * When the Sequence is remapped (export TransitionSeries clock), word clocks
   * are shifted by `startSec - wordsAnchorSec` so karaoke stays locked.
   */
  wordsAnchorSec?: number;
}): CaptionWordTiming[] {
  if (opts.words && opts.words.length > 0) {
    const anchor =
      opts.wordsAnchorSec != null && Number.isFinite(opts.wordsAnchorSec)
        ? opts.wordsAnchorSec
        : opts.startSec;
    const delta = opts.startSec - anchor;
    if (Math.abs(delta) < 1e-6) return opts.words;
    return opts.words.map((w) => ({
      ...w,
      start_sec: w.start_sec + delta,
    }));
  }
  return estimateWordTimings(opts.text, opts.startSec, opts.durationSec);
}

/** Index of the word active at local time (seconds from caption start). */
export function activeWordIndex(
  words: CaptionWordTiming[],
  absoluteTimeSec: number,
): number {
  if (!words.length) return -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const end = w.start_sec + w.duration_sec;
    if (absoluteTimeSec >= w.start_sec && absoluteTimeSec < end) return i;
  }
  if (absoluteTimeSec >= words[words.length - 1]!.start_sec) return words.length - 1;
  return 0;
}
