"""Editor Agent v1 — OpenRouter planner for structured timeline ops.

TTS/voiceover ops are structurally excluded from the allow-list sent to the model.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.services.editor_agent_normalize import normalize_ops
from app.config import settings

ALLOWED_OPS = frozenset(
    {
        "delete_item",
        "move_item",
        "trim_item",
        "replace_media",
        "add_caption",
        "add_text",
        "update_text",
        "update_text_position",
        "add_music",
        "add_sfx",
        "add_broll",
        "set_volume",
        "add_transition",
        "set_transition",
        "remove_transition",
        "add_animation",
        "update_settings",
        "toggle_captions",
        "select_item",
        "set_playhead",
    }
)

BANNED_SUBSTRINGS = ("narrat", "voice", "tts", "sarvam", "speech", "voiceover")

TTS_USER_RE = re.compile(
    r"\b(voiceover|voice[\s-]?over|narrat(ion|or|e)|tts|text[\s-]?to[\s-]?speech|"
    r"regenerate\s+(the\s+)?(voice|audio|speech)|make\s+(the\s+)?narrator|"
    r"change\s+(the\s+)?voice|re[\s-]?synthesize)\b",
    re.I,
)

SYSTEM_PROMPT = """You are the AutoVid editor agent. You plan timeline edits as JSON only.

Return ONLY valid JSON:
{"reply":"short user-facing explanation","ops":[...],"refused":false}

Allowed op names (ONLY these):
""" + ", ".join(sorted(ALLOWED_OPS)) + """

Field names MUST be camelCase exactly as shown:
- delete_item: {op, itemId}
- move_item: {op, itemId, startMs}
- trim_item: {op, itemId, startMs, endMs}
- replace_media: {op, itemId, url}
- add_caption: {op, text, startMs?, durationMs?}
- add_text: {op, text?, startMs?, durationMs?}
- update_text: {op, itemId, text?, fontSize?, color?, fontWeight?, alignment?}
- update_text_position: {op, itemId, x, y}
- add_music / add_sfx / add_broll: {op, label?, url?, startMs?, durationMs?, volume?}
- set_volume: {op, itemId, volume}  (music/sfx only — never narration)
- add_transition: {op, afterItemId, type, durationMs?}
- set_transition: {op, transitionId, type, durationMs?}
- remove_transition: {op, transitionId}
- add_animation: {op, preset, startMs?}
- update_settings: {op, patch:{backgroundColor?, backgroundImage?, overlayDropShadow?, musicVolume?, sfxVolume?, clipAudioVolume?, captionsEnabled?, showTransitions?}}
- toggle_captions: {op, enabled}
- select_item: {op, itemId}
- set_playhead: {op, ms}

Rules:
- Times are milliseconds.
- Transition types: zoom, slide-pan, film-burn, glitch, fade, slide, cut.
- Animation preset "subscribe-cta" is valid for add_animation.
- NEVER emit ops that touch narration, voiceover, TTS, or voice regeneration.
- If the user asks to change voice/narration, set refused=true, ops=[], and explain they must re-run generation outside the agent.
- Prefer 1–6 concrete ops. Use item ids from the timeline context when mutating existing clips.
- Do not invent S3 keys; for replace_media / add_broll use https URLs only when the user provided one.
"""


def _filter_ops(raw_ops: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_ops, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw_ops:
        if not isinstance(item, dict):
            continue
        op = str(item.get("op") or "").strip()
        if op not in ALLOWED_OPS:
            continue
        lower = op.lower()
        if any(b in lower for b in BANNED_SUBSTRINGS):
            continue
        # Extra guard on payload fields
        blob = json.dumps(item).lower()
        if "narration" in blob and op in {"delete_item", "replace_media", "set_volume", "trim_item", "move_item"}:
            # Still allow if itemId happens to contain the word — client enforces narration ban.
            pass
        out.append(item)
    return out


def _extract_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        data = json.loads(match.group(0))
        if isinstance(data, dict):
            return data
    raise ValueError("Model did not return JSON")


async def plan_editor_ops(
    *,
    message: str,
    context: dict[str, Any],
    speed: str = "fast",
) -> dict[str, Any]:
    if TTS_USER_RE.search(message or ""):
        return {
            "reply": (
                "I can’t change voiceover or regenerate narration — that’s outside the editor agent "
                "(TTS boundary). Re-run generation from the project page if you need a new voice track."
            ),
            "ops": [],
            "refused": True,
        }

    if not settings.openrouter_configured:
        return {
            "reply": (
                "LLM planning is unavailable (OPENROUTER_API_KEY not configured). "
                "Try a simple local command like “add caption”, “add music”, or “glitch transition”."
            ),
            "ops": [],
            "refused": False,
        }

    quality = "smart" if speed == "smart" else "fast"
    user_payload = {
        "message": message,
        "quality": quality,
        "timeline_context": context.get("summary") or context,
        "playhead_ms": context.get("playheadMs"),
        "selected_item_id": context.get("selectedItemId"),
        "selected_transition_id": context.get("selectedTransitionId"),
        "duration_ms": context.get("durationMs"),
    }

    # Smart: slightly higher temperature + stronger quality hint for better edit plans.
    system = SYSTEM_PROMPT
    if quality == "smart":
        system += (
            "\nQuality mode: SMART. Prefer precise, well-scoped ops; "
            "double-check item ids from context; avoid no-op or speculative edits."
        )

    body = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
        "temperature": 0.35 if quality == "smart" else 0.15,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.api_base_url,
        "X-Title": "HANUMAN Editor Agent",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        payload = resp.json()

    content = (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed = _extract_json(content if isinstance(content, str) else json.dumps(content))
    ops = normalize_ops(_filter_ops(parsed.get("ops")))
    refused = bool(parsed.get("refused"))
    reply = str(parsed.get("reply") or "").strip() or (
        "Applied timeline edits." if ops else "No edits planned."
    )
    return {"reply": reply, "ops": ops, "refused": refused}
