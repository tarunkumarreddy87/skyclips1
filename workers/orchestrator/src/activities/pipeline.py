"""Temporal activities for the full video generation pipeline."""

from __future__ import annotations

import io
import json
import logging
import re
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any
import asyncio

import httpx
from temporalio import activity

from src.clients.openrouter import chat_completion, chat_completion_detailed
from src.clients.pexels import search_photos, search_videos
from src.clients.sarvam import (
    SarvamQuotaError,
    SarvamTTSError,
    resolve_speaker,
    resolve_target_language,
    synthesize_speech_stream,
)
from src.prompts import (
    SCENE_QUERY_SYSTEM_PROMPT,
    SCRIPT_SYSTEM_PROMPT,
    clamp_duration_sec,
    parse_duration_sec,
    parse_language_code,
    scene_query_user_prompt,
    script_user_prompt,
)
from src.config import settings
from src.pipeline.api_client import ApiClient
from src.pipeline.storage import artifact_key, get_json, put_bytes, put_json

logger = logging.getLogger(__name__)

# Sarvam TTS rejects / truncates long strings — keep under vendor limit with margin.
TTS_MAX_CHARS = 2800
# Larger chunks = fewer serial LLM round-trips on long videos (still fill-checked).
SCRIPT_CHUNK_TARGET_SEC = 150
MAX_SCRIPT_EXTENSION_PASSES = 32
# Require near-full script before TTS so 10-min quotes don't silently ship ~5-min audio.
TARGET_FILL_RATIO = 0.97
MAX_DURATION_SEC = 3600
MIN_DURATION_SEC = 30
# Free-router models often hard-cap output well below requested max_tokens.
SCRIPT_MAX_TOKENS_CAP = 4096
SCRIPT_CHUNK_ATTEMPTS = 4
# Parallelism caps (avoid Sarvam/Pexels 429 storms).
TTS_CONCURRENCY = 4
SCENE_FETCH_CONCURRENCY = 6
# Sarvam English pacing is closer to ~17–18 cps than textbook 14; underestimate → short videos.
ENGLISH_CHARS_PER_SEC = 17.5
INDIC_CHARS_PER_SEC = 14.0


STAGE_LABELS = {
    "validate_brief": "Getting your content ready",
    "run_research": "Researching the topic",
    "generate_script": "Writing the script",
    "parse_script": "Processing your script",
    "generate_voice": "Creating the voiceover",
    "plan_scenes": "Planning visuals",
    "build_timeline": "Building timeline",
    "enqueue_render": "Rendering your video",
}

STAGE_PERCENT = {
    "validate_brief": 5,
    "run_research": 15,
    "generate_script": 30,
    "parse_script": 30,
    "generate_voice": 45,
    "plan_scenes": 65,
    "build_timeline": 78,
    "enqueue_render": 90,
}


def _heartbeat(detail: dict | str | None = None) -> None:
    """Keep Temporal from treating a live long activity as abandoned."""
    try:
        activity.heartbeat(detail)
    except Exception:
        # Outside an activity context (unit tests) — ignore.
        pass


async def _await_with_heartbeats(coro, detail: dict | str | None = None, interval_sec: float = 20.0):
    """Await a long I/O coroutine while emitting Temporal heartbeats."""
    task = asyncio.ensure_future(coro)
    try:
        while True:
            _heartbeat(detail)
            done, _ = await asyncio.wait({task}, timeout=interval_sec)
            if done:
                return task.result()
    except Exception:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        raise


def _audio_duration_sec(data: bytes) -> float:
    """Measure audio duration via ffprobe (Sarvam WAV streams may confuse the wave module)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            check=True,
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
        )
        return max(0.1, float(result.stdout.strip()))
    finally:
        Path(path).unlink(missing_ok=True)


def _wav_duration_sec(data: bytes) -> float:
    # 1) Try a manual chunk scan first — handles Sarvam WAVs with non-standard
    #    padding/extra chunks that the stdlib wave module rejects. No subprocess,
    #    no ffprobe dependency.
    try:
        if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            pos = 12
            fmt: dict[str, int] = {}
            data_size: int | None = None
            while pos + 8 <= len(data):
                chunk_id = data[pos:pos + 4]
                chunk_sz = struct.unpack_from("<I", data, pos + 4)[0]
                body_start = pos + 8
                body_end = body_start + chunk_sz
                if chunk_id == b"fmt " and chunk_sz >= 16:
                    fmt["channels"] = struct.unpack_from("<H", data, body_start + 2)[0]
                    fmt["rate"] = struct.unpack_from("<I", data, body_start + 4)[0]
                    fmt["block"] = struct.unpack_from("<H", data, body_start + 12)[0]
                elif chunk_id == b"data":
                    data_size = chunk_sz
                # chunks are word-aligned (pad to even)
                pos = body_end + (body_end & 1)
                if fmt and data_size is not None:
                    break
            if fmt.get("rate") and fmt.get("block") and data_size is not None:
                duration = data_size / float(fmt["block"] * fmt["rate"] / fmt["channels"])
                if 0.1 <= duration <= 3600:
                    return duration
    except (struct.error, IndexError):
        pass

    # 2) Fall back to the stdlib wave parser for well-formed WAVs.
    try:
        with wave.open(io.BytesIO(data), "rb") as wf:
            duration = wf.getnframes() / float(wf.getframerate())
            if 0.1 <= duration <= 3600:
                return duration
    except (wave.Error, struct.error):
        pass

    # 3) Last resort: ffprobe (needs ffmpeg installed in the container).
    return _audio_duration_sec(data)


async def _progress(ctx: dict, stage: str, status: str, message: str | None = None, **kwargs) -> None:
    api = ApiClient()
    percent = kwargs.pop("percent", STAGE_PERCENT.get(stage))
    await api.emit_progress(
        run_id=ctx["run_id"],
        project_id=ctx["project_id"],
        stage=stage,
        status=status,
        message=message or STAGE_LABELS.get(stage, stage),
        percent=percent,
        **kwargs,
    )


async def _save_artifact(ctx: dict, name: str, data: dict | bytes, content_type: str, artifact_type: str) -> str:
    key = artifact_key(ctx["project_id"], ctx["run_id"], name)
    if isinstance(data, dict):
        put_json(key, data)
        size = len(json.dumps(data))
    else:
        size = put_bytes(key, data, content_type)
    api = ApiClient()
    return await api.register_artifact(
        project_id=ctx["project_id"],
        run_id=ctx["run_id"],
        artifact_type=artifact_type,
        s3_key=key,
        content_type=content_type,
        size_bytes=size,
    )


@activity.defn(name="validate_brief")
async def validate_brief(ctx: dict) -> dict:
    await _progress(ctx, "validate_brief", "started")
    if not ctx.get("prompt_text") and not ctx.get("script_text") and not ctx.get("script_s3_key"):
        raise ValueError("Brief must include prompt, script text, or uploaded script")
    await _progress(ctx, "validate_brief", "completed")
    return {"ok": True}


@activity.defn(name="run_research")
async def run_research(ctx: dict) -> dict:
    await _progress(ctx, "run_research", "started")
    _heartbeat("run_research")
    topic = ctx.get("prompt_text") or ctx.get("title") or "video topic"

    if settings.hanuman_stub_mode or ctx.get("entry_path") == "script_first":
        research = {"topic": topic, "summary": f"Stub research for {topic}", "facts": []}
    else:
        text = await _await_with_heartbeats(
            chat_completion(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Research this video topic in 3-5 bullet facts for a {ctx['format_mode']} video:\n{topic}"
                        ),
                    }
                ],
                max_tokens=800,
            ),
            detail="run_research",
        )
        if text is None:
            text = ""
        research = {"topic": topic, "summary": text, "facts": [line.strip("- ") for line in text.splitlines() if line.strip()]}

    await _save_artifact(ctx, "research.json", research, "application/json", "research")
    await _progress(ctx, "run_research", "completed")
    return research


def _normalize_script_sections(sections: list) -> list[dict]:
    """Ensure each section has id, title, narration, and English image_query."""
    normalized: list[dict] = []
    seen_ids: set[str] = set()
    for i, raw in enumerate(sections or []):
        if not isinstance(raw, dict):
            continue
        sid_raw = str(raw.get("id") or f"section-{i + 1}").strip() or f"section-{i + 1}"
        # Ensure IDs are safe for S3 object keys and stable across retries.
        sid = re.sub(r"[^a-zA-Z0-9]+", "-", sid_raw).strip("-").lower()
        if not sid:
            sid = f"section-{i + 1}"
        # Deduplicate ids across multi-pass generations.
        base = sid
        n = 2
        while sid in seen_ids:
            sid = f"{base}-{n}"
            n += 1
        seen_ids.add(sid)
        title = str(raw.get("title") or sid).strip()
        narration = str(raw.get("narration") or "").strip()
        if not narration:
            continue
        image_query = str(raw.get("image_query") or raw.get("visual_intent") or "").strip()
        if not image_query or _looks_non_english(image_query):
            image_query = title if (title and not _looks_non_english(title)) else ""
        row: dict = {
            "id": sid,
            "title": title,
            "narration": narration,
            "image_query": image_query,
        }
        vt = raw.get("visual_treatment")
        if isinstance(vt, dict) and vt:
            row["visual_treatment"] = vt
        normalized.append(row)
    return normalized


def _looks_non_english(text: str) -> bool:
    """Heuristic: substantial non-ASCII letters → treat as non-English for stock search."""
    if not text:
        return True
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    non_ascii = sum(1 for c in letters if ord(c) > 127)
    return (non_ascii / len(letters)) > 0.15


def _extract_first_json_object(raw: str) -> dict:
    """Extract the first balanced JSON object from LLM output.

    OpenRouter responses sometimes include extra text before/after JSON; regex greediness
    can also capture multiple objects. This parser finds the first balanced {...} block.
    """
    if raw is None:
        raise ValueError("Empty LLM response")
    raw = str(raw).strip()
    if not raw:
        raise ValueError("Empty LLM response")

    # Scan for *each* balanced {...} candidate and try parsing; some models emit
    # extra braces or slightly malformed JSON in the first block.
    idx = 0
    last_error: Exception | None = None
    while True:
        start = raw.find("{", idx)
        if start < 0:
            break
        depth = 0
        in_str = False
        escape = False
        for i in range(start, len(raw)):
            ch = raw[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue

            if ch == '"':
                in_str = True
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = raw[start : i + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError as exc:
                        last_error = exc
                        idx = i + 1
                        break
        else:
            # Ran out of text while still inside a JSON object.
            last_error = ValueError("Unbalanced JSON object in response")
            break

    if "{" not in raw:
        raise ValueError("No JSON object found in response")
    raise ValueError(f"No parseable JSON object found ({last_error})")


def _chars_per_sec_for_language(language: str | None) -> float:
    lang = (language or "en").strip().lower()
    if lang.startswith("en") or lang in ("", "english"):
        return ENGLISH_CHARS_PER_SEC
    return INDIC_CHARS_PER_SEC


def _estimate_spoken_sec(sections: list[dict], *, language: str | None = None) -> float:
    """Spoken duration estimate from character count (calibrated per language family)."""
    total_chars = sum(len(s.get("narration") or "") for s in sections)
    return total_chars / _chars_per_sec_for_language(language)


def _resolve_target_duration(ctx: dict) -> int:
    """Resolve target runtime from approved quote and/or explicit prompt hints."""
    blob = " ".join(
        str(x)
        for x in (ctx.get("prompt_text"), ctx.get("title"), ctx.get("script_text"))
        if x
    )
    from_text = parse_duration_sec(blob)
    from_quote = ctx.get("target_duration_sec")
    candidates: list[int] = []
    if from_quote is not None:
        candidates.append(clamp_duration_sec(from_quote))
    if from_text is not None:
        candidates.append(clamp_duration_sec(from_text))
    if candidates:
        # Prompt may say "30mins" while an older quote still has the 5-minute default.
        return max(candidates)
    return clamp_duration_sec(None, default=300)


def _section_hint_for_chunk(target_sec: int) -> int:
    """Sections per LLM chunk — scales with chunk length (no global 12–20 cap)."""
    return max(3, min(90, round(target_sec / 25)))


def _resolve_language(ctx: dict) -> str:
    blob = " ".join(
        str(x)
        for x in (ctx.get("prompt_text"), ctx.get("title"), ctx.get("script_text"))
        if x
    )
    from_text = parse_language_code(blob, default="")
    if from_text:
        return from_text
    return str(ctx.get("language") or "en")


def _split_narration_for_tts(text: str, max_chars: int = TTS_MAX_CHARS) -> list[str]:
    """Split long narration into TTS-safe chunks on sentence boundaries when possible."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    remaining = text
    # Sentence-ish split for Indic + Latin punctuation.
    parts = re.split(r"(?<=[।.!?…]|\n)\s+", remaining)
    buf = ""
    for part in parts:
        if not part:
            continue
        if len(buf) + len(part) + 1 <= max_chars:
            buf = f"{buf} {part}".strip() if buf else part
            continue
        if buf:
            chunks.append(buf)
            buf = ""
        while len(part) > max_chars:
            chunks.append(part[:max_chars])
            part = part[max_chars:]
        buf = part
    if buf:
        chunks.append(buf)
    return chunks


async def _ensure_english_image_queries(sections: list[dict], topic: str) -> list[dict]:
    """Force EVERY section to have a unique English image_query aligned to its narration."""
    # Always refresh via LLM for non-English narrations or weak queries — stock APIs need English.
    need_refresh = [
        s
        for s in sections
        if _looks_non_english(s.get("image_query") or "")
        or _looks_non_english(s.get("narration") or "")
        or len((s.get("image_query") or "").split()) < 3
    ]
    # Also refresh if many sections share the same query (generic mismatch).
    queries = [s.get("image_query") or "" for s in sections]
    if queries and len(set(queries)) < max(1, len(queries) // 3):
        need_refresh = sections

    if need_refresh:
        try:
            # Batch to keep prompts manageable for long videos.
            batch_size = 12
            by_id: dict[str, str] = {}
            for start in range(0, len(need_refresh), batch_size):
                batch = need_refresh[start : start + batch_size]
                payload_sections = [
                    {
                        "section_id": s["id"],
                        "title": s["title"],
                        "narration": (s.get("narration") or "")[:500],
                    }
                    for s in batch
                ]
                raw = await chat_completion(
                    messages=[
                        {"role": "system", "content": SCENE_QUERY_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": scene_query_user_prompt(topic=topic, sections=payload_sections),
                        },
                    ],
                    temperature=0.2,
                    max_tokens=2000,
                )
                parsed = _extract_first_json_object(raw)
                for q in parsed.get("queries", []):
                    if not isinstance(q, dict):
                        continue
                    sid = str(q.get("section_id") or "")
                    iq = str(q.get("image_query") or "").strip()
                    if sid and iq and not _looks_non_english(iq):
                        by_id[sid] = iq
            for section in sections:
                q = by_id.get(section["id"], "")
                if q:
                    section["image_query"] = q
        except Exception:
            pass

    latin_topic = "".join(c if ord(c) < 128 else " " for c in (topic or "")).strip()
    fallback_base = (latin_topic[:50] or "historical documentary archival").strip()
    used: set[str] = set()
    for i, section in enumerate(sections):
        q = (section.get("image_query") or "").strip()
        if not q or _looks_non_english(q):
            q = f"{fallback_base} scene {i + 1}"
        # Encourage uniqueness so Pexels doesn't return the same photo for every beat.
        if q.lower() in used:
            q = f"{q} {i + 1}"
        used.add(q.lower())
        section["image_query"] = q

    return sections


def _salvage_section_objects(raw: str) -> list[dict]:
    """Pull complete section objects from truncated LLM JSON via brace matching."""
    salvaged: list[dict] = []
    idx = 0
    while True:
        start = raw.find("{", idx)
        if start < 0:
            break
        depth = 0
        in_str = False
        escape = False
        end = -1
        for i in range(start, len(raw)):
            ch = raw[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end < 0:
            break
        chunk = raw[start : end + 1]
        idx = end + 1
        try:
            obj = json.loads(chunk)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and obj.get("narration"):
            salvaged.append(obj)
    return salvaged


def _try_parse_script_sections(raw: str) -> list[dict]:
    """Parse script JSON; on truncated output, salvage any complete section objects."""
    if not raw or not str(raw).strip():
        return []
    try:
        parsed = _extract_first_json_object(raw)
        sections = _normalize_script_sections(
            parsed.get("sections", parsed if isinstance(parsed, list) else [])
        )
        if sections:
            return sections
    except Exception:
        pass
    return _normalize_script_sections(_salvage_section_objects(raw))


async def _generate_script_chunk(
    *,
    topic: str,
    format_mode: str,
    language: str,
    target_sec: int,
    research_summary: str | None,
    part_index: int,
    part_count: int,
    already_covered: list[str],
    label: str = "chunk",
) -> list[dict]:
    """Generate one script chunk; retry/shrink on truncation or empty free-router replies."""
    attempt_sec = int(target_sec)
    last_error: Exception | None = None
    for attempt in range(1, SCRIPT_CHUNK_ATTEMPTS + 1):
        _heartbeat(
            {
                "label": label,
                "part": part_index + 1,
                "parts": part_count,
                "attempt": attempt,
                "target_sec": attempt_sec,
            }
        )
        section_hint = _section_hint_for_chunk(attempt_sec)
        max_tokens = min(
            SCRIPT_MAX_TOKENS_CAP,
            max(1800, int(attempt_sec * 4.0) + section_hint * 60),
        )
        user_prompt = script_user_prompt(
            topic=str(topic),
            format_mode=str(format_mode),
            language_code=str(language),
            target_duration_sec=int(attempt_sec),
            research_summary=research_summary,
            section_hint=section_hint,
            part_index=part_index if part_count > 1 else None,
            part_count=part_count if part_count > 1 else None,
            already_covered=already_covered or None,
        )
        result = await _await_with_heartbeats(
            chat_completion_detailed(
                messages=[
                    {"role": "system", "content": SCRIPT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.75 if attempt == 1 else 0.55,
                max_tokens=max_tokens,
            ),
            detail={
                "label": label,
                "part": part_index + 1,
                "attempt": attempt,
                "waiting": "openrouter",
            },
        )
        truncated = (result.finish_reason or "").lower() in {"length", "max_tokens"}
        activity.logger.info(
            "script_%s part=%s/%s attempt=%s target_sec=%s section_hint=%s max_tokens=%s "
            "finish_reason=%s model=%s truncated=%s raw_chars=%s",
            label,
            part_index + 1,
            part_count,
            attempt,
            attempt_sec,
            section_hint,
            max_tokens,
            result.finish_reason,
            result.model,
            truncated,
            len(result.content or ""),
        )
        sections = _try_parse_script_sections(result.content)
        if sections:
            est = _estimate_spoken_sec(sections, language=language)
            activity.logger.info(
                "script_%s produced sections=%s est_spoken_sec=%.1f (wanted %ss)",
                label,
                len(sections),
                est,
                target_sec,
            )
            return sections
        last_error = ValueError(
            f"No usable script JSON (raw_chars={len(result.content or '')}, "
            f"finish_reason={result.finish_reason}, model={result.model})"
        )
        activity.logger.warning(
            "script_%s attempt=%s failed parse/empty; shrinking target and retrying",
            label,
            attempt,
        )
        attempt_sec = max(MIN_DURATION_SEC, attempt_sec // 2)
    raise last_error or ValueError("Script chunk generation failed")


@activity.defn(name="generate_script")
async def generate_script(ctx: dict) -> dict:
    await _progress(ctx, "generate_script", "started")
    topic = ctx.get("prompt_text") or ctx.get("title") or "video topic"
    target = _resolve_target_duration(ctx)
    language = _resolve_language(ctx)
    activity.logger.info(
        "generate_script start project=%s run=%s target_duration_sec=%s "
        "ctx_target=%s language=%s stub=%s",
        ctx.get("project_id"),
        ctx.get("run_id"),
        target,
        ctx.get("target_duration_sec"),
        language,
        settings.hanuman_stub_mode,
    )

    research_summary = None
    try:
        research = get_json(artifact_key(ctx["project_id"], ctx["run_id"], "research.json"))
        research_summary = research.get("summary") if isinstance(research, dict) else None
    except Exception:
        research_summary = None

    extension_passes_ran = 0
    extension_stop_reason = "stub" if settings.hanuman_stub_mode else "initial"
    part_count = 1

    if settings.hanuman_stub_mode:
        # Scale stub sections so timeline duration roughly matches target in stub mode.
        n = max(3, min(60, target // 20))
        sections = [
            {
                "id": f"section-{i + 1}",
                "title": f"Section {i + 1}",
                "narration": f"Stub narration part {i + 1} about {topic}.",
                "image_query": f"World War historical archival photograph {i + 1}",
            }
            for i in range(n)
        ]
    else:
        # Multi-pass generation for long videos (single LLM call can't fill 30 minutes).
        part_count = max(1, (target + SCRIPT_CHUNK_TARGET_SEC - 1) // SCRIPT_CHUNK_TARGET_SEC)
        chunk_sec = max(MIN_DURATION_SEC, target // part_count)
        sections: list[dict] = []
        covered: list[str] = []
        activity.logger.info(
            "generate_script plan target=%ss part_count=%s chunk_sec=%s "
            "fill_ratio=%.2f max_extension_passes=%s",
            target,
            part_count,
            chunk_sec,
            TARGET_FILL_RATIO,
            MAX_SCRIPT_EXTENSION_PASSES,
        )
        for part_index in range(part_count):
            # Last chunk absorbs remainder.
            this_sec = chunk_sec if part_index < part_count - 1 else max(chunk_sec, target - chunk_sec * (part_count - 1))
            part = await _generate_script_chunk(
                topic=str(topic),
                format_mode=str(ctx.get("format_mode", "documentary")),
                language=str(language),
                target_sec=int(this_sec),
                research_summary=research_summary,
                part_index=part_index,
                part_count=part_count,
                already_covered=covered,
                label="initial",
            )
            if not part:
                raise ValueError(f"Script generation returned no sections for part {part_index + 1}")
            sections.extend(part)
            covered.extend(f"{s['id']}:{s['title']}" for s in part)

        if not sections:
            raise ValueError("Script generation returned no sections")

        # Re-normalize after multi-pass merge — each chunk can reuse section-1, section-2, …
        sections = _normalize_script_sections(sections)
        covered = [f"{s['id']}:{s['title']}" for s in sections]

        # Iteratively extend until spoken estimate is close to target (VidRush ±~2 min tolerance).
        extension_stop_reason = "max_passes"
        low_gain_streak = 0
        for ext_pass in range(MAX_SCRIPT_EXTENSION_PASSES):
            _heartbeat({"stage": "script_extension", "pass": ext_pass + 1, "sections": len(sections)})
            estimated = _estimate_spoken_sec(sections, language=language)
            fill_needed = target * TARGET_FILL_RATIO
            activity.logger.info(
                "script_extension check pass=%s/%s sections=%s estimated=%.1fs "
                "target=%ss fill_needed=%.1fs",
                ext_pass + 1,
                MAX_SCRIPT_EXTENSION_PASSES,
                len(sections),
                estimated,
                target,
                fill_needed,
            )
            if estimated >= fill_needed:
                extension_stop_reason = "fill_ratio_met"
                extension_passes_ran = ext_pass
                break
            deficit = int(target - estimated)
            extra = await _generate_script_chunk(
                topic=str(topic),
                format_mode=str(ctx.get("format_mode", "documentary")),
                language=str(language),
                target_sec=min(SCRIPT_CHUNK_TARGET_SEC, max(90, deficit)),
                research_summary=research_summary,
                part_index=part_count + ext_pass,
                part_count=part_count + ext_pass + 1,
                already_covered=covered,
                label=f"extension-{ext_pass + 1}",
            )
            extension_passes_ran = ext_pass + 1
            if not extra:
                extension_stop_reason = "empty_extension_response"
                activity.logger.warning(
                    "script_extension stopped: empty response at pass=%s estimated=%.1fs target=%ss",
                    ext_pass + 1,
                    estimated,
                    target,
                )
                break
            before = estimated
            sections.extend(extra)
            sections = _normalize_script_sections(sections)
            covered = [f"{s['id']}:{s['title']}" for s in sections]
            after = _estimate_spoken_sec(sections, language=language)
            activity.logger.info(
                "script_extension pass=%s added_sections=%s est %.1fs -> %.1fs",
                ext_pass + 1,
                len(extra),
                before,
                after,
            )
            # If the model adds almost nothing repeatedly, stop burning free-router calls.
            if after - before < 15:
                low_gain_streak += 1
                activity.logger.warning(
                    "script_extension low gain (%.1fs) on pass=%s streak=%s",
                    after - before,
                    ext_pass + 1,
                    low_gain_streak,
                )
                if low_gain_streak >= 3:
                    extension_stop_reason = "stagnation"
                    break
            else:
                low_gain_streak = 0
        else:
            extension_passes_ran = MAX_SCRIPT_EXTENSION_PASSES

        sections = await _ensure_english_image_queries(sections, str(topic))
        sections = _normalize_script_sections(sections)

    estimated_final = _estimate_spoken_sec(sections, language=language)
    activity.logger.info(
        "generate_script done sections=%s estimated=%.1fs target=%ss "
        "extension_passes=%s stop_reason=%s fill=%.1f%%",
        len(sections),
        estimated_final,
        target,
        extension_passes_ran,
        extension_stop_reason,
        (100.0 * estimated_final / target) if target else 0.0,
    )
    if not settings.hanuman_stub_mode and estimated_final < target * TARGET_FILL_RATIO:
        raise ValueError(
            f"Script under-filled duration: estimated {estimated_final:.0f}s "
            f"vs target {target}s (need >= {target * TARGET_FILL_RATIO:.0f}s). "
            f"extension_passes={extension_passes_ran} stop_reason={extension_stop_reason}"
        )

    script = {
        "format_mode": ctx["format_mode"],
        "language": language,
        "target_duration_sec": target,
        "estimated_spoken_sec": round(estimated_final, 2),
        "script_generation": {
            "part_count": part_count,
            "extension_passes": extension_passes_ran,
            "extension_stop_reason": extension_stop_reason,
            "fill_ratio_required": TARGET_FILL_RATIO,
            "chunk_target_sec": SCRIPT_CHUNK_TARGET_SEC,
        },
        "sections": sections,
    }
    await _save_artifact(ctx, "script.json", script, "application/json", "script")
    await _progress(ctx, "generate_script", "completed")
    return script


@activity.defn(name="parse_script")
async def parse_script(ctx: dict) -> dict:
    await _progress(ctx, "parse_script", "started")
    text = ctx.get("script_text") or ""
    if not text.strip() and ctx.get("script_s3_key"):
        from src.pipeline.storage import get_bytes

        text = get_bytes(ctx["script_s3_key"]).decode("utf-8", errors="replace")
    sections = []
    for i, block in enumerate([b.strip() for b in text.split("\n\n") if b.strip()]):
        sections.append(
            {
                "id": f"section-{i+1}",
                "title": f"Section {i+1}",
                "narration": block,
                "image_query": "",
            }
        )
    if not sections:
        sections = [
            {
                "id": "section-1",
                "title": "Script",
                "narration": text,
                "image_query": "",
            }
        ]
    topic = ctx.get("prompt_text") or ctx.get("title") or "documentary"
    language = _resolve_language(ctx)
    target = _resolve_target_duration(ctx)
    if not settings.hanuman_stub_mode:
        sections = await _ensure_english_image_queries(sections, str(topic))
    else:
        for s in sections:
            s["image_query"] = s["image_query"] or "documentary archival photograph"
    estimated = _estimate_spoken_sec(sections, language=language)
    if not settings.hanuman_stub_mode and estimated < target * TARGET_FILL_RATIO:
        activity.logger.warning(
            "script_first under-filled: estimated=%.1fs target=%ss (%.0f%%). "
            "User script is shorter than requested video length — extending via LLM.",
            estimated,
            target,
            100.0 * estimated / target if target else 0.0,
        )
        covered = [f"{s['id']}:{s['title']}" for s in sections]
        research_summary = None
        for ext_pass in range(MAX_SCRIPT_EXTENSION_PASSES):
            estimated = _estimate_spoken_sec(sections, language=language)
            if estimated >= target * TARGET_FILL_RATIO:
                break
            deficit = int(target - estimated)
            extra = await _generate_script_chunk(
                topic=str(topic),
                format_mode=str(ctx.get("format_mode", "documentary")),
                language=str(language),
                target_sec=min(SCRIPT_CHUNK_TARGET_SEC, max(90, deficit)),
                research_summary=research_summary,
                part_index=ext_pass,
                part_count=ext_pass + 1,
                already_covered=covered,
                label=f"script-first-extension-{ext_pass + 1}",
            )
            if not extra:
                break
            sections.extend(extra)
            sections = _normalize_script_sections(sections)
            covered = [f"{s['id']}:{s['title']}" for s in sections]
        sections = await _ensure_english_image_queries(sections, str(topic))
        sections = _normalize_script_sections(sections)
        estimated = _estimate_spoken_sec(sections, language=language)
    script = {
        "format_mode": ctx["format_mode"],
        "language": language,
        "target_duration_sec": target,
        "estimated_spoken_sec": round(estimated, 2),
        "sections": sections,
    }
    await _save_artifact(ctx, "script.json", script, "application/json", "script")
    await _progress(ctx, "parse_script", "completed")
    return script


@activity.defn(name="generate_voice")
async def generate_voice(ctx: dict) -> dict:
    await _progress(ctx, "generate_voice", "started")
    script_key = artifact_key(ctx["project_id"], ctx["run_id"], "script.json")
    script = get_json(script_key)
    language = script.get("language") or _resolve_language(ctx)
    lang = resolve_target_language(str(language))
    speaker = resolve_speaker(ctx.get("voice_id", settings.sarvam_tts_speaker))
    segment_files: list[str] = []
    segment_meta: list[dict] = []
    used_silent_fallback = False

    allow_silent = bool(settings.hanuman_stub_mode or settings.allow_silent_tts_fallback)
    if settings.hanuman_stub_mode:
        activity.logger.warning(
            "HANUMAN_STUB_MODE=true — generate_voice will use silent WAV (dev only)"
        )
    elif settings.allow_silent_tts_fallback:
        activity.logger.warning(
            "ALLOW_SILENT_TTS_FALLBACK=true — TTS failures may produce silent audio (dev only)"
        )

    sections = list(script["sections"])
    # Precompute pieces per section so we can synthesize TTS pieces in parallel.
    section_pieces: list[list[str]] = []
    for section in sections:
        narration = str(section.get("narration") or "").strip()
        if settings.hanuman_stub_mode:
            section_pieces.append([])
        else:
            section_pieces.append(_split_narration_for_tts(narration))

    if not settings.hanuman_stub_mode:
        jobs: list[tuple[int, int, str]] = []
        for si, pieces in enumerate(section_pieces):
            for pi, piece in enumerate(pieces):
                jobs.append((si, pi, piece))

        results: dict[tuple[int, int], bytes] = {}
        sem = asyncio.Semaphore(TTS_CONCURRENCY)

        done_count = 0
        done_lock = asyncio.Lock()

        async def _one(si: int, pi: int, piece: str) -> None:
            nonlocal used_silent_fallback, done_count
            async with sem:
                try:
                    results[(si, pi)] = await _await_with_heartbeats(
                        synthesize_speech_stream(
                            text=piece,
                            speaker=speaker,
                            target_language_code=lang,
                        ),
                        detail={"tts": f"{si}:{pi}"},
                    )
                except SarvamQuotaError as exc:
                    if allow_silent:
                        activity.logger.error(
                            "Sarvam quota/billing failure; silent fallback enabled: %s",
                            exc,
                        )
                        results[(si, pi)] = _silent_wav(max(1.0, len(piece) / 12.0))
                        used_silent_fallback = True
                        return
                    await _progress(
                        ctx,
                        "generate_voice",
                        "failed",
                        message=(
                            "Voice synthesis failed: Sarvam TTS has no credits / billing issue "
                            f"({exc}). Top up the Sarvam account or set ALLOW_SILENT_TTS_FALLBACK=true "
                            "for local dev only."
                        ),
                    )
                    raise RuntimeError(
                        "TTS failed (Sarvam quota/billing). Project cannot complete without voiceover. "
                        f"Details: {exc}"
                    ) from exc
                except SarvamTTSError as exc:
                    if allow_silent:
                        activity.logger.error(
                            "Sarvam TTS failure; silent fallback enabled: %s",
                            exc,
                        )
                        results[(si, pi)] = _silent_wav(max(1.0, len(piece) / 12.0))
                        used_silent_fallback = True
                        return
                    await _progress(
                        ctx,
                        "generate_voice",
                        "failed",
                        message=f"Voice synthesis failed after retries: {exc}",
                    )
                    raise RuntimeError(
                        "TTS failed after retries. Project cannot complete without voiceover. "
                        f"Details: {exc}"
                    ) from exc
                finally:
                    async with done_lock:
                        done_count += 1
                        if done_count == 1 or done_count % 4 == 0 or done_count == len(jobs):
                            _heartbeat({"tts_done": done_count, "tts_total": len(jobs)})

        if jobs:
            activity.logger.info(
                "generate_voice parallel TTS jobs=%s concurrency=%s sections=%s",
                len(jobs),
                TTS_CONCURRENCY,
                len(sections),
            )
            await asyncio.gather(*[_one(si, pi, piece) for si, pi, piece in jobs])

    for si, section in enumerate(sections):
        sid = section["id"]
        narration = str(section.get("narration") or "").strip()
        if settings.hanuman_stub_mode:
            audio = _silent_wav(max(2.0, len(narration) / 12.0))
            used_silent_fallback = True
        else:
            pieces = section_pieces[si]
            if not pieces:
                audio = _silent_wav(0.5)
            else:
                wav_parts = [results[(si, pi)] for pi in range(len(pieces))]
                audio = _concat_wav_bytes(wav_parts)
                if not _wav_has_speech_energy(audio) and not allow_silent:
                    await _progress(
                        ctx,
                        "generate_voice",
                        "failed",
                        message=f"TTS returned silent/near-silent audio for section {sid}",
                    )
                    raise RuntimeError(
                        f"TTS produced no audible speech for section {sid}. "
                        "Refusing to mark generation as successful."
                    )
        key = artifact_key(ctx["project_id"], ctx["run_id"], f"audio/{sid}.wav")
        put_bytes(key, audio, "audio/wav")
        duration = _wav_duration_sec(audio)
        section["actual_duration_sec"] = duration
        # Persist per-synth-piece clocks so captions lock to spoken audio (no STT).
        if settings.hanuman_stub_mode:
            pieces = _split_narration_for_tts(narration) or ([narration] if narration else [])
            if pieces:
                weights = [max(1.0, float(len(p))) for p in pieces]
                wsum = sum(weights) or 1.0
                section["tts_pieces"] = [
                    {
                        "text": p,
                        "duration_sec": max(0.05, duration * (w / wsum)),
                    }
                    for p, w in zip(pieces, weights, strict=True)
                ]
            else:
                section["tts_pieces"] = []
        else:
            pieces = section_pieces[si]
            if pieces:
                wav_parts = [results[(si, pi)] for pi in range(len(pieces))]
                section["tts_pieces"] = [
                    {
                        "text": piece,
                        "duration_sec": max(0.05, _wav_duration_sec(part)),
                    }
                    for piece, part in zip(pieces, wav_parts, strict=True)
                ]
            else:
                section["tts_pieces"] = []
        segment_files.append(key)
        segment_meta.append({"section_id": sid, "s3_key": key, "duration_sec": duration})

    combined = _merge_wav_from_keys(segment_files)
    narration_key = artifact_key(ctx["project_id"], ctx["run_id"], "narration.wav")
    put_bytes(narration_key, combined, "audio/wav")

    if used_silent_fallback and not allow_silent:
        raise RuntimeError("Silent TTS fallback used without ALLOW_SILENT_TTS_FALLBACK/stub mode")

    if not settings.hanuman_stub_mode and not _wav_has_speech_energy(combined) and not allow_silent:
        await _progress(
            ctx,
            "generate_voice",
            "failed",
            message="Combined narration.wav has no audible speech energy",
        )
        raise RuntimeError(
            "Combined narration has no audible speech. Refusing silent success."
        )

    put_json(script_key, script)
    total_duration = sum(s["duration_sec"] for s in segment_meta)
    target = float(script.get("target_duration_sec") or 0)

    # If real TTS is shorter than the char-rate estimate, top up with more script+voice
    # so 10-min quotes don't land at ~7–8 min.
    topup_passes = 0
    while (
        not settings.hanuman_stub_mode
        and target > 0
        and total_duration < target * 0.92
        and topup_passes < 3
    ):
        deficit = max(60, int(target - total_duration))
        topup_passes += 1
        _heartbeat({"stage": "voice_topup", "pass": topup_passes, "actual": total_duration})
        activity.logger.warning(
            "generate_voice top-up pass=%s actual=%.1fs target=%.1fs deficit≈%ss",
            topup_passes,
            total_duration,
            target,
            deficit,
        )
        topic = ctx.get("prompt_text") or ctx.get("title") or "video topic"
        covered = [f"{s.get('id')}:{s.get('title')}" for s in sections]
        try:
            extra = await _generate_script_chunk(
                topic=str(topic),
                format_mode=str(ctx.get("format_mode", "documentary")),
                language=str(language),
                target_sec=min(SCRIPT_CHUNK_TARGET_SEC, deficit + 30),
                research_summary=None,
                part_index=len(sections),
                part_count=len(sections) + 1,
                already_covered=covered,
                label=f"voice-topup-{topup_passes}",
            )
        except Exception as exc:
            activity.logger.error("voice top-up script failed: %s", exc)
            break
        if not extra:
            break

        # Deduplicate ids before writing audio keys / segment meta.
        existing_ids = {str(s.get("id") or "") for s in sections}
        for section in extra:
            sid = str(section.get("id") or "topup")
            base = sid
            n = 2
            while sid in existing_ids:
                sid = f"{base}-{n}"
                n += 1
            existing_ids.add(sid)
            section["id"] = sid

            narration = str(section.get("narration") or "").strip()
            pieces = _split_narration_for_tts(narration)
            wav_parts: list[bytes] = []
            for pi, piece in enumerate(pieces):
                try:
                    wav_parts.append(
                        await _await_with_heartbeats(
                            synthesize_speech_stream(
                                text=piece,
                                speaker=speaker,
                                target_language_code=lang,
                            ),
                            detail={"tts_topup": f"{sid}:{pi}"},
                        )
                    )
                except SarvamQuotaError:
                    if allow_silent:
                        wav_parts.append(_silent_wav(max(1.0, len(piece) / 12.0)))
                        used_silent_fallback = True
                    else:
                        raise
                except SarvamTTSError:
                    if allow_silent:
                        wav_parts.append(_silent_wav(max(1.0, len(piece) / 12.0)))
                        used_silent_fallback = True
                    else:
                        raise
            audio = _concat_wav_bytes(wav_parts) if wav_parts else _silent_wav(0.5)
            key = artifact_key(ctx["project_id"], ctx["run_id"], f"audio/{sid}.wav")
            put_bytes(key, audio, "audio/wav")
            duration = _wav_duration_sec(audio)
            section["actual_duration_sec"] = duration
            if wav_parts and pieces:
                section["tts_pieces"] = [
                    {
                        "text": piece,
                        "duration_sec": max(0.05, _wav_duration_sec(part)),
                    }
                    for piece, part in zip(pieces, wav_parts, strict=True)
                ]
            else:
                section["tts_pieces"] = []
            sections.append(section)
            segment_files.append(key)
            segment_meta.append({"section_id": sid, "s3_key": key, "duration_sec": duration})

        script["sections"] = sections
        put_json(script_key, script)
        combined = _merge_wav_from_keys(segment_files)
        put_bytes(narration_key, combined, "audio/wav")
        total_duration = sum(s["duration_sec"] for s in segment_meta)
        activity.logger.info(
            "generate_voice top-up pass=%s now=%.1fs (%.0f%% of target)",
            topup_passes,
            total_duration,
            100.0 * total_duration / target,
        )

    if target > 0 and total_duration < target * 0.85:
        activity.logger.warning(
            "generate_voice still short vs target: actual=%.1fs target=%.1fs (%.0f%%) "
            "after %s top-up passes",
            total_duration,
            target,
            100.0 * total_duration / target,
            topup_passes,
        )
    result = {
        "narration_key": narration_key,
        "segments": segment_meta,
        "total_duration_sec": total_duration,
        "used_silent_fallback": used_silent_fallback,
        "voice_topup_passes": topup_passes,
    }
    await _save_artifact(ctx, "narration.wav", combined, "audio/wav", "narration")
    await _progress(ctx, "generate_voice", "completed")
    return result


def _wav_has_speech_energy(data: bytes, *, min_peak: int = 500, min_rms: float = 40.0) -> bool:
    """Return True if PCM WAV looks like real speech (not near-silent)."""
    try:
        with wave.open(io.BytesIO(data), "rb") as wf:
            if wf.getsampwidth() != 2:
                return len(data) > 1000
            nframes = wf.getnframes()
            # Cap read — some Sarvam streams report bogus huge frame counts.
            to_read = min(nframes, wf.getframerate() * 120) if nframes > 0 else 0
            if to_read <= 0:
                # Fall back to raw payload after typical 44-byte header.
                raw = data[44:]
            else:
                raw = wf.readframes(to_read)
        if len(raw) < 4:
            return False
        import struct
        import math

        count = len(raw) // 2
        samples = struct.unpack("<" + "h" * count, raw[: count * 2])
        if not samples:
            return False
        peak = max(abs(s) for s in samples)
        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
        return peak >= min_peak and rms >= min_rms
    except Exception:
        # If we cannot parse, require a non-trivial payload size as a weak signal.
        return len(data) > 8000


def _concat_wav_bytes(parts: list[bytes]) -> bytes:
    """Concatenate complete WAV blobs into one PCM WAV (same format assumed)."""
    if not parts:
        return _silent_wav(1.0)
    if len(parts) == 1:
        return parts[0]
    readers = []
    for blob in parts:
        readers.append(wave.open(io.BytesIO(blob), "rb"))
    try:
        return _merge_wav_bytes(readers)
    finally:
        for r in readers:
            r.close()


def _silent_wav(duration_sec: float, rate: int = 22050) -> bytes:
    nframes = int(rate * duration_sec)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(b"\x00\x00" * nframes)
    return buf.getvalue()


def _merge_wav_from_keys(keys: list[str]) -> bytes:
    from src.pipeline.storage import get_bytes

    if not keys:
        return _silent_wav(1.0)
    if len(keys) == 1:
        return get_bytes(keys[0])

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        concat_list = work / "concat.txt"
        lines: list[str] = []
        for i, key in enumerate(keys):
            segment_path = work / f"segment_{i}.wav"
            segment_path.write_bytes(get_bytes(key))
            lines.append(f"file '{segment_path.as_posix()}'")
        concat_list.write_text("\n".join(lines), encoding="utf-8")
        output_path = work / "narration.wav"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-ar",
                "22050",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ],
            check=True,
            capture_output=True,
        )
        return output_path.read_bytes()


def _merge_wav_bytes(readers: list) -> bytes:
    if not readers:
        return _silent_wav(1.0)
    params = readers[0].getparams()
    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setparams(params)
        for reader in readers:
            wf.writeframes(reader.readframes(reader.getnframes()))
    return out.getvalue()


@activity.defn(name="plan_scenes")
async def plan_scenes(ctx: dict) -> dict:
    await _progress(ctx, "plan_scenes", "started")
    script = get_json(artifact_key(ctx["project_id"], ctx["run_id"], "script.json"))
    topic = ctx.get("prompt_text") or ctx.get("title") or "historical documentary"
    # Skip LLM query rewrite when image_query fields already look English (generate_script
    # already ran _ensure_english_image_queries for prompt_first).
    raw_sections = [
        {
            "id": str(s.get("id") or f"section-{i}"),
            "title": str(s.get("title") or ""),
            "narration": str(s.get("narration") or ""),
            "image_query": str(s.get("image_query") or s.get("visual_intent") or ""),
        }
        for i, s in enumerate(script.get("sections") or [])
    ]
    need_query_refresh = any(
        not q or _looks_non_english(q) for q in (s["image_query"] for s in raw_sections)
    )
    if need_query_refresh:
        sections = await _ensure_english_image_queries(raw_sections, str(topic))
        by_id = {s["id"]: s for s in sections}
        for section in script.get("sections") or []:
            sid = str(section.get("id") or "")
            if sid in by_id and by_id[sid].get("image_query"):
                section["image_query"] = by_id[sid]["image_query"]
        put_json(artifact_key(ctx["project_id"], ctx["run_id"], "script.json"), script)
    else:
        activity.logger.info(
            "plan_scenes skipping image_query LLM rewrite — queries already English"
        )

    used_photo_ids: set[int | str] = set()
    used_video_ids: set[int | str] = set()
    id_lock = asyncio.Lock()
    sem = asyncio.Semaphore(SCENE_FETCH_CONCURRENCY)

    async def _fetch_one(section: dict) -> dict:
        sid = section["id"]
        query = (
            section.get("image_query")
            or (section.get("title") if not _looks_non_english(str(section.get("title") or "")) else "")
            or "historical documentary archival photo"
        )
        duration = float(section.get("actual_duration_sec", 5.0) or 5.0)
        narration = str(section.get("narration") or "")
        broll_query = _broll_query_from_narration(narration, fallback=str(query))
        # Prefer stock video for longer scenes so A-roll is not all stills.
        prefer_video = duration >= 6.0

        if settings.hanuman_stub_mode:
            image_bytes = _placeholder_png()
            image_key = artifact_key(ctx["project_id"], ctx["run_id"], f"assets/{sid}.png")
            put_bytes(image_key, image_bytes, "image/png")
            asset_ref = {"type": "placeholder", "s3_key": image_key}
            broll_key = artifact_key(ctx["project_id"], ctx["run_id"], f"assets/{sid}-broll.png")
            put_bytes(broll_key, image_bytes, "image/png")
            broll_ref = {"type": "placeholder", "s3_key": broll_key, "query": broll_query}
        else:
            async with sem:
                asset_ref = None
                if prefer_video:
                    try:
                        videos = await search_videos(str(query), per_page=6)
                        chosen_v = None
                        async with id_lock:
                            for video in videos:
                                vid = video.get("id")
                                if vid is not None and vid in used_video_ids:
                                    continue
                                chosen_v = video
                                if vid is not None:
                                    used_video_ids.add(vid)
                                break
                            if chosen_v is None and videos:
                                chosen_v = videos[0]
                        if chosen_v and chosen_v.get("download_url"):
                            async with httpx.AsyncClient(timeout=120.0) as client:
                                vid_resp = await client.get(chosen_v["download_url"])
                                vid_resp.raise_for_status()
                            video_key = artifact_key(
                                ctx["project_id"], ctx["run_id"], f"assets/{sid}.mp4"
                            )
                            put_bytes(video_key, vid_resp.content, "video/mp4")
                            asset_ref = {
                                "type": "stock_video",
                                "s3_key": video_key,
                                "license": "pexels",
                                "url": chosen_v.get("download_url"),
                                "query": query,
                                "pexels_id": chosen_v.get("id"),
                            }
                    except Exception as video_exc:
                        activity.logger.warning(
                            "plan_scenes video fetch failed sid=%s err=%s — falling back to photo",
                            sid,
                            video_exc,
                        )

                if asset_ref is None:
                    photos = await search_photos(str(query), per_page=8)
                    chosen = None
                    async with id_lock:
                        for photo in photos:
                            pid = photo.get("id")
                            if pid is not None and pid in used_photo_ids:
                                continue
                            chosen = photo
                            if pid is not None:
                                used_photo_ids.add(pid)
                            break
                        if chosen is None and photos:
                            chosen = photos[0]

                    if chosen is None:
                        image_bytes = _placeholder_png()
                        image_key = artifact_key(ctx["project_id"], ctx["run_id"], f"assets/{sid}.png")
                        put_bytes(image_key, image_bytes, "image/png")
                        asset_ref = {"type": "placeholder", "s3_key": image_key}
                    else:
                        src = chosen["src"].get("large") or chosen["src"].get("original")
                        async with httpx.AsyncClient(timeout=60.0) as client:
                            img = await client.get(src)
                            img.raise_for_status()
                        image_key = artifact_key(ctx["project_id"], ctx["run_id"], f"assets/{sid}.jpg")
                        put_bytes(image_key, img.content, "image/jpeg")
                        asset_ref = {
                            "type": "stock_image",
                            "s3_key": image_key,
                            "license": "pexels",
                            "url": src,
                            "query": query,
                            "pexels_id": chosen.get("id"),
                        }

                broll_ref = await _fetch_secondary_broll(
                    ctx,
                    section_id=str(sid),
                    query=broll_query,
                    used_photo_ids=used_photo_ids,
                    id_lock=id_lock,
                )

        return {
            "id": f"scene-{sid}",
            "section_id": sid,
            "visual_intent": query,
            "image_query": query,
            "broll_query": broll_query,
            "asset_ref": asset_ref,
            "broll_asset_ref": broll_ref,
            "duration_sec": duration,
        }

    section_list = list(script["sections"])
    activity.logger.info(
        "plan_scenes fetching scenes=%s concurrency=%s stub=%s",
        len(section_list),
        SCENE_FETCH_CONCURRENCY,
        settings.hanuman_stub_mode,
    )
    _heartbeat({"stage": "plan_scenes", "scenes": len(section_list)})
    fetch_tasks = [_fetch_one(s) for s in section_list]
    scenes_out: list[dict] = []
    # Batch gather with periodic heartbeats so long Pexels runs survive worker restarts.
    batch = 6
    for i in range(0, len(fetch_tasks), batch):
        chunk = await asyncio.gather(*fetch_tasks[i : i + batch])
        scenes_out.extend(chunk)
        _heartbeat({"stage": "plan_scenes", "done": len(scenes_out), "total": len(section_list)})
    scenes = scenes_out

    payload = {"scenes": scenes}
    await _save_artifact(ctx, "scenes.json", payload, "application/json", "scenes")
    await _progress(ctx, "plan_scenes", "completed")
    return payload


def _broll_query_from_narration(narration: str, *, fallback: str) -> str:
    """Derive a secondary visual query from spoken words (Footage-Agent style)."""
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", narration or "")
    stop = {
        "the", "and", "for", "that", "with", "this", "from", "were", "was", "are", "have",
        "has", "had", "been", "they", "their", "them", "into", "onto", "about", "would",
        "could", "should", "which", "when", "where", "what", "while", "than", "then",
        "also", "just", "over", "under", "after", "before", "because", "through",
        "there", "these", "those", "your", "you", "our", "his", "her", "its", "not",
        "but", "all", "any", "can", "will", "one", "two", "out", "how", "who", "why",
    }
    content = [w for w in words if w.lower() not in stop]
    if len(content) >= 4:
        mid = len(content) // 3
        phrase = " ".join(content[mid : mid + 5])
        return f"{phrase} documentary photo"
    if content:
        return f"{' '.join(content[:5])} archival image"
    return f"{fallback} detail"


async def _fetch_secondary_broll(
    ctx: dict,
    *,
    section_id: str,
    query: str,
    used_photo_ids: set[int | str],
    id_lock: asyncio.Lock | None = None,
) -> dict:
    """Fetch a distinct Pexels image for the Image/B-roll lane."""
    try:
        photos = await search_photos(str(query), per_page=8)
    except Exception:
        photos = []
    chosen = None

    async def _pick() -> dict | None:
        nonlocal chosen
        for photo in photos:
            pid = photo.get("id")
            if pid is not None and pid in used_photo_ids:
                continue
            chosen = photo
            if pid is not None:
                used_photo_ids.add(pid)
            break
        if chosen is None and photos:
            chosen = photos[0]
        return chosen

    if id_lock is not None:
        async with id_lock:
            await _pick()
    else:
        await _pick()

    if chosen is None:
        image_bytes = _placeholder_png()
        image_key = artifact_key(ctx["project_id"], ctx["run_id"], f"assets/{section_id}-broll.png")
        put_bytes(image_key, image_bytes, "image/png")
        return {"type": "placeholder", "s3_key": image_key, "query": query}

    src = chosen["src"].get("large") or chosen["src"].get("original")
    async with httpx.AsyncClient(timeout=60.0) as client:
        img = await client.get(src)
        img.raise_for_status()
    image_key = artifact_key(ctx["project_id"], ctx["run_id"], f"assets/{section_id}-broll.jpg")
    put_bytes(image_key, img.content, "image/jpeg")
    return {
        "type": "stock_image",
        "s3_key": image_key,
        "license": "pexels",
        "url": src,
        "query": query,
        "pexels_id": chosen.get("id"),
    }


def _placeholder_png() -> bytes:
    # 1x1 blue PNG
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
        "de0000000c4944415408d76360a0000000020001e221bc330000000049454e44ae426082"
    )


@activity.defn(name="build_timeline")
async def build_timeline(ctx: dict) -> dict:
    await _progress(ctx, "build_timeline", "started")
    _heartbeat("build_timeline")
    scenes_data = get_json(artifact_key(ctx["project_id"], ctx["run_id"], "scenes.json"))
    narration_key = artifact_key(ctx["project_id"], ctx["run_id"], "narration.wav")
    from src.pipeline.storage import get_bytes, put_bytes
    from src.activities.caption_chunks import (
        captions_from_tts_pieces,
        chunk_narration_for_captions,
    )
    from src.activities.music_beds import pick_music_mood, synthesize_music_bed
    from src.activities.timeline_transitions import (
        assign_transitions,
        detect_subscribe_overlay,
    )
    from src.activities.scene_visual_treatment import (
        animation_for_treatment,
        broll_animation_for_treatment,
        build_scene_text_overlay,
        normalize_visual_treatment,
    )

    total_duration = _wav_duration_sec(get_bytes(narration_key))
    raw_durations = [max(0.1, float(scene["duration_sec"])) for scene in scenes_data["scenes"]]
    raw_sum = sum(raw_durations) or float(len(raw_durations))
    # Prefer TTS-measured scene durations when they already match narration.wav
    # (avoids proportional rescale drift vs voice clocks).
    use_measured = abs(raw_sum - total_duration) / max(total_duration, 0.1) <= 0.03

    script = get_json(artifact_key(ctx["project_id"], ctx["run_id"], "script.json"))
    sections_list = [s for s in (script.get("sections") or []) if isinstance(s, dict)]
    sections_by_id = {str(s.get("id") or ""): s for s in sections_list}
    format_mode = str(ctx.get("format_mode") or "documentary")
    run_id = str(ctx["run_id"])
    scene_count = len(scenes_data["scenes"])

    video_clips = []
    broll_clips = []
    treatments: list[dict] = []
    start = 0.0
    for idx, (scene, raw) in enumerate(zip(scenes_data["scenes"], raw_durations, strict=True)):
        duration = float(raw) if use_measured else total_duration * (raw / raw_sum)
        clip_type = "image" if scene["asset_ref"]["s3_key"].endswith((".png", ".jpg", ".jpeg")) else "video"
        # Stable unique clip ids — scene ids alone collide when sections reuse titles.
        clip_id = f"{scene['id']}-{idx}"
        scene_id = str(scene.get("id") or "")
        section_id = scene_id.removeprefix("scene-") if scene_id.startswith("scene-") else scene_id
        section = sections_by_id.get(section_id) or sections_by_id.get(scene_id) or {}
        treatment = normalize_visual_treatment(
            section.get("visual_treatment") or scene.get("visual_treatment"),
            section=section or {"id": section_id, "title": scene.get("title"), "narration": ""},
            index=idx,
            total=scene_count,
            run_id=run_id,
            format_mode=format_mode,
        )
        treatments.append(treatment)

        clip: dict = {
            "id": clip_id,
            "scene_id": scene["id"],
            "type": clip_type,
            "src": scene["asset_ref"]["s3_key"],
            "start_sec": start,
            "duration_sec": duration,
            "fit": "cover",
        }
        # Still A-roll: per-scene motion (parallax / ken burns / zoom / float / …).
        if clip_type == "image" and not ctx.get("disable_animations"):
            anim = animation_for_treatment(treatment, duration)
            if anim:
                clip["animation"] = anim
                clip["visual_treatment"] = treatment
        video_clips.append(clip)
        broll_ref = scene.get("broll_asset_ref") or {}
        broll_src = broll_ref.get("s3_key")
        if broll_src and duration >= 2.5:
            # Secondary visual in the middle third of the scene (spoken-content match).
            b_start = start + duration * 0.28
            b_dur = min(duration * 0.42, max(1.5, duration - (b_start - start) - 0.4))
            broll_clip: dict = {
                "id": f"broll-{clip_id}",
                "scene_id": scene["id"],
                "type": "image" if str(broll_src).endswith((".png", ".jpg", ".jpeg")) else "video",
                "src": broll_src,
                "start_sec": b_start,
                "duration_sec": b_dur,
                "fit": "cover",
                "label": str(scene.get("broll_query") or scene.get("image_query") or "B-roll"),
            }
            if broll_clip["type"] == "image" and not ctx.get("disable_animations"):
                b_anim = broll_animation_for_treatment(treatment, b_dur)
                if b_anim:
                    broll_clip["animation"] = b_anim
            broll_clips.append(broll_clip)
        start += duration

    # Snap final clip end to narration length when using measured durations
    # (tiny float drift between segment WAVs and merged narration.wav).
    if use_measured and video_clips and total_duration > 0:
        drift = total_duration - (
            float(video_clips[-1]["start_sec"]) + float(video_clips[-1]["duration_sec"])
        )
        if abs(drift) <= 0.25:
            video_clips[-1]["duration_sec"] = max(
                0.1, float(video_clips[-1]["duration_sec"]) + drift
            )
    section_narration = {
        sid: str(s.get("narration") or "").strip() for sid, s in sections_by_id.items()
    }
    captions = []
    for clip in video_clips:
        scene_id = str(clip.get("scene_id") or clip.get("id") or "")
        section_id = scene_id.removeprefix("scene-") if scene_id.startswith("scene-") else scene_id
        section = sections_by_id.get(section_id) or {}
        text = section_narration.get(section_id, "")
        if not text:
            continue
        pieces = section.get("tts_pieces") if isinstance(section.get("tts_pieces"), list) else None
        if pieces:
            captions.extend(
                captions_from_tts_pieces(
                    pieces,
                    start_sec=float(clip["start_sec"]),
                    section_id=section_id,
                    clip_id=str(clip["id"]),
                )
            )
        else:
            # Fallback: same TTS splitter layout, durations by speak-weight of pieces.
            layout = _split_narration_for_tts(text)
            if len(layout) > 1:
                weights = [max(1.0, float(len(p))) for p in layout]
                wsum = sum(weights) or 1.0
                clip_dur = float(clip["duration_sec"])
                fake_pieces = [
                    {"text": p, "duration_sec": max(0.05, clip_dur * (w / wsum))}
                    for p, w in zip(layout, weights, strict=True)
                ]
                captions.extend(
                    captions_from_tts_pieces(
                        fake_pieces,
                        start_sec=float(clip["start_sec"]),
                        section_id=section_id,
                        clip_id=str(clip["id"]),
                    )
                )
            else:
                captions.extend(
                    chunk_narration_for_captions(
                        text,
                        start_sec=float(clip["start_sec"]),
                        duration_sec=float(clip["duration_sec"]),
                        section_id=section_id,
                        clip_id=str(clip["id"]),
                    )
                )

    narrations_ordered = [
        section_narration.get(
            str(s.get("id") or ""),
            "",
        )
        for s in script.get("sections") or []
    ]
    from shared_types.themes import get_theme, resolve_theme_id

    theme_id = resolve_theme_id(str(ctx.get("brand_profile_id") or "standard"))
    theme = get_theme(theme_id)
    blocked = {str(t).strip().lower() for t in (ctx.get("blocklisted_transitions") or []) if t}
    prefs = [
        t
        for t in (theme.get("transition_preference") or ())
        if str(t).strip().lower() not in blocked
    ]
    transitions = assign_transitions(
        video_clips,
        run_id=str(ctx["run_id"]),
        transition_types=tuple(prefs) if prefs else None,
        # Transition INTO the next clip uses the outgoing scene's treatment.
        per_boundary_types=[
            treatments[i].get("transition") if i < len(treatments) else None
            for i in range(max(0, len(video_clips) - 1))
        ],
        density=0.65,
    )
    overlays: list[dict] = []
    if not ctx.get("disable_overlays"):
        subscribe_overlay = detect_subscribe_overlay(narrations_ordered, total_duration)
        for idx, clip in enumerate(video_clips):
            scene_id = str(clip.get("scene_id") or "")
            section_id = scene_id.removeprefix("scene-") if scene_id.startswith("scene-") else scene_id
            section = sections_by_id.get(section_id) or {}
            treatment = treatments[idx] if idx < len(treatments) else {}
            overlay = build_scene_text_overlay(
                treatment,
                section=section,
                clip=clip,
                index=idx,
            )
            if overlay:
                overlays.append(overlay)
        if subscribe_overlay:
            overlays.append(subscribe_overlay)

    # Mood-matched library bed (synthesized template — not custom composition).
    mood = pick_music_mood(str(ctx.get("format_mode") or "documentary"), script)
    music_key = artifact_key(ctx["project_id"], ctx["run_id"], "assets/music-bed.wav")
    with tempfile.TemporaryDirectory() as tmp:
        bed_path = Path(tmp) / "music-bed.wav"
        bed_meta = synthesize_music_bed(bed_path, duration_sec=total_duration, mood=mood)
        put_bytes(music_key, bed_path.read_bytes(), "audio/wav")

    music_volume = 0.28 if mood in ("serious", "documentary") else 0.32
    music_clips = [
        {
            "id": "music-bed",
            "type": "music",
            "src": music_key,
            "start_sec": 0.0,
            "duration_sec": total_duration,
            "volume": music_volume,
            "fade_in_sec": min(2.5, total_duration * 0.05),
            "fade_out_sec": min(3.0, total_duration * 0.06),
            "mood": bed_meta["mood"],
            "label": bed_meta["label"],
        }
    ]

    manifest = {
        "version": "1",
        "metadata": {
            "project_id": ctx["project_id"],
            "run_id": ctx["run_id"],
            "format_mode": ctx["format_mode"],
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": total_duration,
        },
        "tracks": {
            "video": video_clips,
            "audio": [
                {
                    "id": "audio-narration",
                    "type": "narration",
                    "src": narration_key,
                    "start_sec": 0.0,
                    "duration_sec": total_duration,
                    "volume": 1.0,
                }
            ],
            "captions": captions,
            "broll": broll_clips,
            "music": music_clips,
        },
        "transitions": transitions,
        "overlays": overlays,
        "settings": {
            "captions_enabled": True,
            "music_volume": music_volume,
            "narration_volume": 1.0,
            "theme_id": theme_id,
        },
    }
    await _save_artifact(ctx, "timeline.v1.json", manifest, "application/json", "timeline")
    await _progress(ctx, "build_timeline", "completed")
    return {"timeline_key": artifact_key(ctx["project_id"], ctx["run_id"], "timeline.v1.json")}

@activity.defn(name="complete_timeline")
async def complete_timeline(ctx: dict) -> None:
    """Mark generation run complete once timeline + assets exist.

    MP4 rendering is intentionally deferred until the user clicks "Render video" in the editor.
    """
    api = ApiClient()
    await api.update_run_status(
        ctx["run_id"],
        status="completed",
        current_stage="build_timeline",
        project_status="completed",
    )
    await _progress(
        ctx,
        "build_timeline",
        "completed",
        message="Timeline ready — open the editor to preview, then Render video for MP4",
        percent=100,
        artifact_type="timeline",
    )


@activity.defn(name="complete_run")
async def complete_run(ctx: dict) -> None:
    api = ApiClient()
    await api.update_run_status(
        ctx["run_id"],
        status="completed",
        current_stage="enqueue_render",
        project_status="completed",
    )
    await _progress(
        ctx,
        "enqueue_render",
        "completed",
        message="Your video is ready",
        percent=100,
        artifact_type="final_video",
    )


@activity.defn(name="fail_run")
async def fail_run(payload: dict) -> None:
    api = ApiClient()
    await api.update_run_status(
        payload["run_id"],
        status="failed",
        current_stage=payload.get("stage"),
        error_message=payload.get("error"),
        project_status="failed",
    )
    await api.emit_progress(
        run_id=payload["run_id"],
        project_id=payload["project_id"],
        stage=payload.get("stage", "enqueue_render"),
        status="failed",
        message=payload.get("error", "Generation failed"),
        percent=payload.get("percent"),
    )
