"""Rule-based quote inference for Phase 2 (no LLM)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from shared_types.themes import infer_theme_from_text, resolve_theme_id

from app.db.models import Brief, FormatMode, Project
from app.services.prompt_parse import clamp_duration_sec, parse_duration_sec, parse_language_code

DEFAULT_VOICE_ID = "shubh"  # Sarvam speaker (bulbul:v3 default)
CREDITS_PER_MINUTE = 24  # informational placeholder

DOCUMENTARY_SECTIONS = [
    {"title": "Introduction", "summary": "Hook the viewer and introduce the topic."},
    {"title": "Context", "summary": "Background and why this story matters."},
    {"title": "Main narrative", "summary": "Core story beats and key facts."},
    {"title": "Conclusion", "summary": "Wrap-up and final takeaway."},
]

LISTICLE_FALLBACK_SECTIONS = [
    {"title": "Introduction", "summary": "Set up the list and why it matters."},
    {"title": "List items", "summary": "Cover each item with visuals and narration."},
    {"title": "Conclusion", "summary": "Recap and call to action."},
]


@dataclass(frozen=True)
class InferredQuote:
    format_mode: FormatMode
    duration_sec: int
    language: str
    voice_id: str
    model_id: str
    brand_profile_id: str
    section_outline: list[dict[str, str]]
    credit_estimate: int
    resolution: str
    aspect_ratio: str
    warnings: list[str]


def _prompt_blob(project: Project, brief: Brief) -> str:
    return " ".join(
        part
        for part in (
            project.title or "",
            brief.prompt_text or "",
            brief.script_text or "",
        )
        if part
    )


def _estimate_duration(project: Project, brief: Brief) -> int:
    # A duration stated in the user brief is the most specific intent. This
    # also handles the UI default when a prompt asks for a longer runtime.
    from_text = parse_duration_sec(_prompt_blob(project, brief))
    if from_text is not None:
        return clamp_duration_sec(from_text)
    if brief.target_duration_sec:
        return clamp_duration_sec(brief.target_duration_sec)
    if project.format_mode == FormatMode.LISTICLE:
        return 180
    return 300


def _estimate_language(brief: Brief, project: Project) -> str:
    blob = _prompt_blob(project, brief)
    from_text = parse_language_code(blob, default="")
    if from_text:
        return from_text
    return brief.language or "en"


def _resolve_brand_profile(project: Project, brief: Brief) -> str:
    """Theme id stored as brand_profile_id; keyword-infer when unset/legacy default."""
    raw = (brief.brand_profile_id or "").strip()
    # Explicit user/channel choice (not legacy placeholder) wins.
    if raw and raw.lower() not in ("bp-1", "default", ""):
        return resolve_theme_id(raw)
    return infer_theme_from_text(_prompt_blob(project, brief))


def _content_density_warning(duration_sec: int, brief: Brief, outline: list[dict[str, str]]) -> str | None:
    """Warn when brief substance is thin for the requested runtime (VidRush docs)."""
    if brief.script_text and len(brief.script_text.strip()) > 300:
        return None

    minutes = duration_sec / 60
    if minutes < 8:
        return None

    required_points = max(1, round(minutes * 0.5))
    prompt = (brief.prompt_text or "").strip()
    sentences = [s.strip() for s in re.split(r"[.!?\n]+", prompt) if s.strip()]
    talking_points = max(len(outline), len(sentences))

    if talking_points >= required_points * 0.65:
        return None

    return (
        f"Your brief has roughly {talking_points} talking point(s), but a {int(minutes)}-minute video "
        f"typically needs ~{required_points}. The final video may run shorter unless you add more "
        f"detail to your prompt or choose a shorter duration."
    )


def _credit_estimate(duration_sec: int) -> int:
    # Bill partial minutes proportionally but round up so every requested second is covered.
    return max(CREDITS_PER_MINUTE, ((duration_sec + 59) // 60) * CREDITS_PER_MINUTE)


def _listicle_sections_from_script(script_text: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for line in script_text.splitlines():
        stripped = line.strip()
        match = re.match(r"^(\d+)[.)]\s*(.+)$", stripped)
        if match:
            num, title = match.group(1), match.group(2).strip()
            summary = title[:120] + ("…" if len(title) > 120 else "")
            items.append({"title": f"#{num}: {title[:60]}", "summary": summary})
    if items:
        return [
            {"title": "Introduction", "summary": "Introduce the list and set expectations."},
            *items,
            {"title": "Conclusion", "summary": "Summarize key points and close."},
        ]
    return LISTICLE_FALLBACK_SECTIONS


def _documentary_sections_from_prompt(prompt_text: str) -> list[dict[str, str]]:
    first_sentence = prompt_text.strip().split(".")[0][:80]
    sections = [dict(s) for s in DOCUMENTARY_SECTIONS]
    sections[0]["summary"] = f"Open on: {first_sentence or 'the main topic'}."
    return sections


def infer_quote(project: Project, brief: Brief) -> InferredQuote:
    duration_sec = _estimate_duration(project, brief)
    language = _estimate_language(brief, project)

    if project.format_mode == FormatMode.LISTICLE:
        if brief.script_text:
            outline = _listicle_sections_from_script(brief.script_text)
        else:
            outline = LISTICLE_FALLBACK_SECTIONS
    else:
        prompt = brief.prompt_text or brief.script_text or project.title
        outline = _documentary_sections_from_prompt(prompt)

    warnings: list[str] = []
    density = _content_density_warning(duration_sec, brief, outline)
    if density:
        warnings.append(density)

    return InferredQuote(
        format_mode=project.format_mode,
        duration_sec=duration_sec,
        language=language,
        voice_id=DEFAULT_VOICE_ID,
        model_id=brief.model_id or "skyclip-v1",
        brand_profile_id=_resolve_brand_profile(project, brief),
        section_outline=outline,
        credit_estimate=_credit_estimate(duration_sec),
        resolution="1920x1080",
        aspect_ratio="16:9",
        warnings=warnings,
    )
