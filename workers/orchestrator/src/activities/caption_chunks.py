"""Split section narration into subtitle-sized caption clips.

Caption clocks must stay locked to measured TTS audio:
- Prefer tts_pieces[] (text + measured duration_sec per synth call)
- Within a piece, display-split with punctuation-aware word weights
"""

from __future__ import annotations

import re

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+|(?<=[。！？])\s*")
_WORD_SPLIT = re.compile(r"\s+")
# Alphanumeric / letters for weight — mirrors packages/shared-types estimateWordTimings.
_WORD_CORE = re.compile(r"[^\w]+", re.UNICODE)
_END_CLAUSE = re.compile(r"[.!?…][\"'”’)]?$")
_MID_PAUSE = re.compile(r"[,;:—–-][\"'”’)]?$")
_HAS_DIGIT = re.compile(r"\d")


def wrap_caption_lines(text: str, *, max_chars: int = 42, max_lines: int = 2) -> list[str]:
    """Hard-wrap a single caption into at most max_lines for burn-in / preview."""
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return []
    words = _WORD_SPLIT.split(cleaned)
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
            if len(lines) >= max_lines:
                # Overflow: append ellipsis to last line
                last = lines[-1]
                lines[-1] = (last[: max(0, max_chars - 1)].rstrip() + "…") if len(last) >= max_chars else f"{last}…"
                return lines
        current = word if len(word) <= max_chars else word[: max_chars - 1] + "…"
    if current and len(lines) < max_lines:
        lines.append(current)
    elif current and lines:
        last = lines[-1]
        lines[-1] = (last[: max(0, max_chars - 1)].rstrip() + "…") if len(last) >= max_chars else f"{last}…"
    return lines[:max_lines]


def word_speak_weight(word: str) -> float:
    """
    Relative spoken weight for a token.
    Longer content + trailing punctuation pauses + numbers speak slower than
    plain letter counting — closer to TTS cadence.
    """
    w = str(word or "")
    core = _WORD_CORE.sub("", w)
    base = float(max(1, len(core) or len(w)))
    if _END_CLAUSE.search(w):
        base += 4.0
    elif _MID_PAUSE.search(w):
        base += 2.0
    if _HAS_DIGIT.search(w):
        base += 2.0
    # Very short function words still take a beat
    if len(core) <= 2:
        base = max(base, 1.5)
    return base


def estimate_word_timings(
    text: str,
    *,
    start_sec: float,
    duration_sec: float,
) -> list[dict]:
    """
    Word clocks for Karaoke / boxed_pill within a caption window.
    Prefer punctuation-aware weights so highlight cadence tracks speech better
    than plain character proportions.
    """
    words = [w for w in _WORD_SPLIT.split(str(text or "").strip()) if w]
    if not words or duration_sec <= 0:
        return []

    weights = [word_speak_weight(w) for w in words]
    total = float(sum(weights)) or 1.0
    cursor = float(start_sec)
    used = 0.0
    out: list[dict] = []
    for i, (word, weight) in enumerate(zip(words, weights, strict=True)):
        is_last = i == len(words) - 1
        if is_last:
            dur = max(0.04, float(duration_sec) - used)
        else:
            dur = max(0.04, float(duration_sec) * (weight / total))
        out.append(
            {
                "text": word,
                "start_sec": cursor,
                "duration_sec": dur,
            }
        )
        cursor += dur
        used += dur
    return out


def chunk_narration_for_captions(
    text: str,
    *,
    start_sec: float,
    duration_sec: float,
    section_id: str,
    clip_id: str,
    max_chars: int = 64,
) -> list[dict]:
    """
    Split narration into timed caption clips (~2 subtitle lines each).

    Timing inside the window is weight-proportional. Prefer
    `captions_from_tts_pieces` when measured TTS piece clocks are available.
    """
    cleaned = " ".join(str(text or "").split())
    if not cleaned or duration_sec <= 0:
        return []

    # Prefer sentence boundaries; fall back to phrase packing.
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(cleaned) if s and s.strip()]
    if not sentences:
        sentences = [cleaned]

    chunks: list[str] = []
    buf = ""
    for sentence in sentences:
        candidate = f"{buf} {sentence}".strip() if buf else sentence
        if len(candidate) <= max_chars:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
            buf = ""
        if len(sentence) <= max_chars:
            buf = sentence
            continue
        # Long sentence: pack by words into max_chars pieces.
        words = _WORD_SPLIT.split(sentence)
        piece = ""
        for word in words:
            cand = f"{piece} {word}".strip() if piece else word
            if len(cand) <= max_chars:
                piece = cand
            else:
                if piece:
                    chunks.append(piece)
                piece = word if len(word) <= max_chars else word[: max_chars - 1] + "…"
        if piece:
            buf = piece
    if buf:
        chunks.append(buf)

    if not chunks:
        return []

    # Weight chunks by spoken content, not raw chars (matches word clocks).
    weights = [
        sum(word_speak_weight(w) for w in _WORD_SPLIT.split(c) if w) or float(max(1, len(c)))
        for c in chunks
    ]
    total_w = float(sum(weights)) or 1.0
    cursor = float(start_sec)
    remaining = float(duration_sec)
    out: list[dict] = []
    for i, (chunk, weight) in enumerate(zip(chunks, weights, strict=True)):
        if i == len(chunks) - 1:
            dur = max(0.35, remaining)
        else:
            dur = max(0.35, duration_sec * (weight / total_w))
            remaining -= dur
        # Ensure each chunk itself fits 2 visual lines.
        display = " ".join(wrap_caption_lines(chunk, max_chars=42, max_lines=2))
        out.append(
            {
                "id": f"caption-{clip_id}-{i}",
                "section_id": section_id,
                "text": display,
                "start_sec": cursor,
                "duration_sec": dur,
                "words": estimate_word_timings(display, start_sec=cursor, duration_sec=dur),
            }
        )
        cursor += dur
    return out


def captions_from_tts_pieces(
    pieces: list[dict],
    *,
    start_sec: float,
    section_id: str,
    clip_id: str,
    max_chars: int = 64,
) -> list[dict]:
    """
    Build caption clips locked to measured TTS synth piece clocks.

    Each TTS call has a measured duration_sec — caption windows never cross
    piece boundaries, so on-screen text tracks the spoken audio.
    """
    cursor = float(start_sec)
    out: list[dict] = []
    for pi, piece in enumerate(pieces or []):
        if not isinstance(piece, dict):
            continue
        text = " ".join(str(piece.get("text") or "").split())
        piece_dur = max(0.05, float(piece.get("duration_sec") or 0.0))
        if not text:
            cursor += piece_dur
            continue
        caps = chunk_narration_for_captions(
            text,
            start_sec=cursor,
            duration_sec=piece_dur,
            section_id=section_id,
            clip_id=f"{clip_id}-p{pi}",
            max_chars=max_chars,
        )
        out.extend(caps)
        cursor += piece_dur
    return out
