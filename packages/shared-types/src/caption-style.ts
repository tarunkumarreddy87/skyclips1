/**
 * Project-level caption / subtitle styles shared by preview and cloud export.
 * Karaoke uses proportional word timings when TTS word clocks aren't available.
 */

export type CaptionStyleId = "cinematic" | "clean_highlight" | "kinetic" | "editorial" | "bold_static" | "karaoke" | "boxed_pill" | "minimal" | "neon" | "typewriter";

export const CAPTION_STYLE_IDS: CaptionStyleId[] = [
  "cinematic",
  "clean_highlight",
  "kinetic",
  "editorial",
  "bold_static",
  "karaoke",
  "boxed_pill",
  "minimal",
  "neon",
  "typewriter",
];

export const DEFAULT_CAPTION_STYLE: CaptionStyleId = "cinematic";

export interface CaptionStyleMeta {
  id: CaptionStyleId;
  label: string;
  description: string;
  /** Swatch for the picker. */
  swatch: string;
}

export const CAPTION_STYLE_META: Record<CaptionStyleId, CaptionStyleMeta> = {
  cinematic: { id: "cinematic", label: "Cinematic", description: "Refined phrase captions with a subtle entrance and soft shadow", swatch: "linear-gradient(135deg,#18181b,#52525b)" },
  clean_highlight: { id: "clean_highlight", label: "Highlight", description: "Clean typography with spoken-word emphasis", swatch: "linear-gradient(90deg,#fbbf24 40%,#fafafa 40%)" },
  kinetic: { id: "kinetic", label: "Kinetic", description: "Words reveal in sync with speech with restrained motion", swatch: "linear-gradient(135deg,#6366f1,#a5b4fc)" },
  editorial: { id: "editorial", label: "Editorial", description: "A quiet, framed phrase with generous spacing", swatch: "linear-gradient(135deg,#27272a,#e4e4e7)" },
  minimal: { id: "minimal", label: "Subtitle", description: "Clean sentence subtitles", swatch: "#27272a" },
  neon: { id: "neon", label: "Neon", description: "Glowing text", swatch: "#0891b2" },
  typewriter: { id: "typewriter", label: "Word Reveal", description: "Reveal each spoken word", swatch: "#be123c" },
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
  if (raw === "bold" || raw === "outline" || raw === "modern") {
    return "bold_static";
  }
  if (raw === "gradient") return "boxed_pill";
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
 * Sum of durations is forced to equal durationSec so preview/export stay locked
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
      ? Math.max(0, durationSec - used)
      : (durationSec * weights[i]!) / total;
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
   * Moving a caption shifts its word clocks by `startSec - wordsAnchorSec`.
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
  return -1;
}
