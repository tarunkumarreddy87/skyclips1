/**
 * Caption display chunking — mirrors workers/orchestrator caption_chunks.py.
 * Prefer measured tts_pieces clocks when available; otherwise TTS-layout fallback.
 */

import { estimateWordTimings, wordSpeakWeight, type CaptionWordTiming } from "./caption-style";

export interface CaptionChunk {
  id: string;
  section_id: string;
  text: string;
  start_sec: number;
  duration_sec: number;
  words: CaptionWordTiming[];
}

export interface TtsPieceClock {
  text: string;
  duration_sec: number;
}

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|(?<=[。！？])\s*/u;

export function wrapCaptionLines(
  text: string,
  maxChars = 42,
  maxLines = 2,
): string[] {
  const cleaned = String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1]!;
        lines[lines.length - 1] =
          last.length >= maxChars
            ? `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
            : `${last}…`;
        return lines;
      }
    }
    current =
      word.length <= maxChars
        ? word
        : `${word.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  if (current && lines.length < maxLines) lines.push(current);
  else if (current && lines.length) {
    const last = lines[lines.length - 1]!;
    lines[lines.length - 1] =
      last.length >= maxChars
        ? `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
        : `${last}…`;
  }
  return lines.slice(0, maxLines);
}

/** Match workers/orchestrator _split_narration_for_tts (default 2800). */
export function splitNarrationForTts(text: string, maxChars = 2800): string[] {
  const cleaned = String(text || "").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const parts = cleaned.split(/(?<=[।.!?…]|\n)\s+/u);
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    if (!part) continue;
    if ((buf ? buf.length + 1 : 0) + part.length <= maxChars) {
      buf = buf ? `${buf} ${part}` : part;
      continue;
    }
    if (buf) {
      chunks.push(buf);
      buf = "";
    }
    let rem = part;
    while (rem.length > maxChars) {
      chunks.push(rem.slice(0, maxChars));
      rem = rem.slice(maxChars);
    }
    buf = rem;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export function chunkNarrationForCaptions(opts: {
  text: string;
  startSec: number;
  durationSec: number;
  sectionId: string;
  clipId: string;
  maxChars?: number;
}): CaptionChunk[] {
  const cleaned = String(opts.text || "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  if (!cleaned || opts.durationSec <= 0) return [];

  const maxChars = opts.maxChars ?? 64;
  let sentences = cleaned
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) sentences = [cleaned];

  const chunks: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    const candidate = buf ? `${buf} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      buf = candidate;
      continue;
    }
    if (buf) {
      chunks.push(buf);
      buf = "";
    }
    if (sentence.length <= maxChars) {
      buf = sentence;
      continue;
    }
    const words = sentence.split(/\s+/);
    let piece = "";
    for (const word of words) {
      const cand = piece ? `${piece} ${word}` : word;
      if (cand.length <= maxChars) piece = cand;
      else {
        if (piece) chunks.push(piece);
        piece =
          word.length <= maxChars
            ? word
            : `${word.slice(0, Math.max(0, maxChars - 1))}…`;
      }
    }
    if (piece) buf = piece;
  }
  if (buf) chunks.push(buf);
  if (!chunks.length) return [];

  const weights = chunks.map((c) => {
    const ws = c.split(/\s+/).filter(Boolean);
    return ws.reduce((a, w) => a + wordSpeakWeight(w), 0) || Math.max(1, c.length);
  });
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = opts.startSec;
  let remaining = opts.durationSec;
  const out: CaptionChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const weight = weights[i]!;
    const isLast = i === chunks.length - 1;
    const dur = isLast
      ? Math.max(0.35, remaining)
      : Math.max(0.35, (opts.durationSec * weight) / totalW);
    if (!isLast) remaining -= dur;
    const display = wrapCaptionLines(chunk, 42, 2).join(" ");
    out.push({
      id: `caption-${opts.clipId}-${i}`,
      section_id: opts.sectionId,
      text: display,
      start_sec: cursor,
      duration_sec: dur,
      words: estimateWordTimings(display, cursor, dur),
    });
    cursor += dur;
  }
  return out;
}

export function captionsFromTtsPieces(opts: {
  pieces: TtsPieceClock[];
  startSec: number;
  sectionId: string;
  clipId: string;
  maxChars?: number;
}): CaptionChunk[] {
  let cursor = opts.startSec;
  const out: CaptionChunk[] = [];
  for (let pi = 0; pi < opts.pieces.length; pi++) {
    const piece = opts.pieces[pi]!;
    const text = String(piece.text || "")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
    const pieceDur = Math.max(0.05, Number(piece.duration_sec) || 0);
    if (!text) {
      cursor += pieceDur;
      continue;
    }
    out.push(
      ...chunkNarrationForCaptions({
        text,
        startSec: cursor,
        durationSec: pieceDur,
        sectionId: opts.sectionId,
        clipId: `${opts.clipId}-p${pi}`,
        maxChars: opts.maxChars,
      }),
    );
    cursor += pieceDur;
  }
  return out;
}

/** Rebuild display captions for a section window (editor realign / no STT). */
export function captionsForSectionWindow(opts: {
  narration: string;
  startSec: number;
  durationSec: number;
  sectionId: string;
  clipId?: string;
  pieces?: TtsPieceClock[] | null;
}): CaptionChunk[] {
  const clipId = opts.clipId || `scene-${opts.sectionId}`;
  if (opts.pieces && opts.pieces.length > 0) {
    return captionsFromTtsPieces({
      pieces: opts.pieces,
      startSec: opts.startSec,
      sectionId: opts.sectionId,
      clipId,
    });
  }
  const layout = splitNarrationForTts(opts.narration);
  if (layout.length > 1) {
    const weights = layout.map((p) => Math.max(1, p.length));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const fake = layout.map((text, i) => ({
      text,
      duration_sec: Math.max(0.05, (opts.durationSec * weights[i]!) / wsum),
    }));
    return captionsFromTtsPieces({
      pieces: fake,
      startSec: opts.startSec,
      sectionId: opts.sectionId,
      clipId,
    });
  }
  return chunkNarrationForCaptions({
    text: opts.narration,
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    sectionId: opts.sectionId,
    clipId,
  });
}
