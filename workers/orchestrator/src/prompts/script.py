"""LLM prompts for video generation pipeline stages."""

from __future__ import annotations

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "en-in": "English (India)",
    "hi": "Hindi",
    "te": "Telugu",
    "ta": "Tamil",
    "kn": "Kannada",
    "ml": "Malayalam",
    "bn": "Bengali",
    "mr": "Marathi",
    "gu": "Gujarati",
    "pa": "Punjabi",
}


def language_display_name(code: str | None) -> str:
    if not code:
        return "English"
    key = code.strip().lower().replace("_", "-")
    if key in LANGUAGE_NAMES:
        return LANGUAGE_NAMES[key]
    short = key.split("-")[0]
    return LANGUAGE_NAMES.get(short, code)


SCRIPT_SYSTEM_PROMPT = """\
You are an expert YouTube documentary / listicle scriptwriter and voiceover director.

Write scripts people actually watch — spoken aloud, emotional, clear, and cinematic.

Voice & craft:
- Write for the ear, not the page. Short sentences. Natural pauses. Conversational.
- Open with a hook in the first 1–2 lines (curiosity, stakes, or a vivid image).
- Build tension and release; use sensory detail and human stakes, not dry encyclopedia tone.
- Keep facts accurate; dramatize with emotion, not by inventing false claims.
- End sections so they flow into the next; close the video with a resonant takeaway or soft CTA.

Language rules (critical):
- Write every "narration" field entirely in the TARGET LANGUAGE specified by the user.
- Do NOT mix English into narration unless that word is a proper name commonly left in English.
- Field "title" may be a short section label in the TARGET LANGUAGE.
- Field "image_query" MUST be plain English only (3–10 concrete visual keywords).
  Stock photo APIs are English-indexed. The query MUST describe the VISUAL for THIS section's \
narration meaning — not the whole video topic repeated.
  Good: "World War 2 Normandy D-Day landing beach soldiers 1944"
  Good: "Hitler Nazi Germany speeches 1930s archival"
  Bad: Telugu/Hindi text, vague words like "history war", or copying narration.

Duration rules (critical):
- Target total spoken runtime is given in seconds. Fill ALL of it with narration.
- Golden rule: ~0.5 substantive talking points per minute (a 30-minute video needs ~15 beats).
- Produce enough sections so spoken length ≈ target (±10%). Guide: ~2.2–2.5 words/sec.
- Prefer ~1 section per 20–40 seconds of speech (not one short chapter for a long video).
- Never write a 1–2 minute script when the user asked for 30 minutes.

Structure:
- Return ONLY valid JSON (no markdown fences, no commentary).
- Shape: {"sections":[{"id":"...","title":"...","narration":"...","image_query":"...","visual_treatment":{...}}, ...]}
- id values: short kebab-case English identifiers (intro, causes, turning-point, outro, etc.).

Visual treatment (required per section — vary across the video, never copy-paste the same values):
- visual_treatment object fields:
  - mood: hook | tension | reveal | calm | climax | outro | list_item
  - motion: parallax_pan | ken_burns | zoom_in | float | fade | drop | slide
  - direction: left-right | right-left | top-bottom | bottom-top  (for pans)
  - transition: zoom | slide-pan | film-burn | glitch | fade | slide | dissolve | cut
    (transition INTO the NEXT section; outro may use cut/fade)
  - text_overlay: none | chapter_title | lower_third | freeform_text
- Match treatment to THIS section's emotional beat (hook ≠ climax ≠ calm).
- Alternate motion styles so consecutive sections feel different.
- Use chapter_title / lower_third sparingly (roughly every 2–4 sections), not on every beat.
- Hook: often parallax_pan or zoom_in, text_overlay none, strong transition out.
- Climax / conflict: zoom_in / ken_burns, film-burn or glitch transition, optional chapter_title.
- Calm / meaning: float or fade, dissolve/fade transition, usually no text.
- Listicle items: mix ken_burns / parallax_pan / slide; chapter_title on numbered beats is OK.

Format modes:
- documentary: narrative arc (hook → context → conflict → climax → meaning).
- listicle: numbered beats with a clear through-line, still emotional and spoken.
"""


def script_user_prompt(
    *,
    topic: str,
    format_mode: str,
    language_code: str,
    target_duration_sec: int,
    research_summary: str | None = None,
    section_hint: int | None = None,
    part_index: int | None = None,
    part_count: int | None = None,
    already_covered: list[str] | None = None,
) -> str:
    lang_name = language_display_name(language_code)
    research_block = ""
    if research_summary and research_summary.strip():
        research_block = (
            f"\nResearch notes (use if helpful; narrate in {lang_name}):\n"
            f"{research_summary.strip()[:4000]}\n"
        )

    minutes = max(1, round(target_duration_sec / 60))
    words_target = int(target_duration_sec * 2.3)
    talking_points = max(1, round(minutes * 0.5))
    sections_target = section_hint or max(4, min(90, round(target_duration_sec / 30)))

    chunk_block = ""
    if part_index is not None and part_count is not None and part_count > 1:
        chunk_block = (
            f"\nThis is PART {part_index + 1} of {part_count} of a longer script.\n"
            f"Write ONLY this part's sections (~{target_duration_sec}s of speech, "
            f"~{sections_target} sections). Do not repeat earlier parts.\n"
        )
        if already_covered:
            chunk_block += "Already covered section ids/titles: " + "; ".join(already_covered[:40]) + "\n"

    return f"""\
TARGET LANGUAGE for narration: {lang_name} (code: {language_code})
Format mode: {format_mode}
Target spoken runtime for THIS response: ~{target_duration_sec} seconds (~{minutes} min)
Target words (approx): {words_target}
Target talking points (approx): {talking_points}
Target section count (approx): {sections_target}
Topic / user brief:
{topic}
{research_block}{chunk_block}
Write the script now.
Remember:
1) narration = {lang_name} only
2) image_query = English only, SPECIFIC to that section's content (people, place, year, event)
3) Match the duration — enough spoken content for ~{target_duration_sec}s
4) Every section MUST include visual_treatment with DIFFERENT motion/transition/text choices \
matched to that scene's mood — do not reuse one template for the whole video
Return JSON only.
"""


SCENE_QUERY_SYSTEM_PROMPT = """\
You map each script section to a DISTINCT English stock-photo search query.

Rules:
- Return ONLY JSON: {"queries":[{"section_id":"...","image_query":"..."}, ...]}
- image_query: 3–10 English keywords, concrete and visual (era, place, people, objects).
- MUST reflect THIS section's narration meaning — translate the idea to English visuals.
- Do NOT reuse the same generic query for every section.
- Do NOT put Telugu/Hindi/any non-English script in image_query.
- Prefer historically accurate documentary B-roll terms when the topic is history/war.
"""


def scene_query_user_prompt(*, topic: str, sections: list[dict]) -> str:
    lines = [f"Overall topic: {topic}", "Sections:"]
    for s in sections:
        lines.append(
            f"- id={s['section_id']}\n"
            f"  title={s.get('title', '')}\n"
            f"  narration={s.get('narration', '')[:500]}"
        )
    lines.append(
        "For EACH section output a unique English image_query matching that narration's visuals."
    )
    return "\n".join(lines)
