"""Place researched, 16:9 editorial scenes on A-roll rather than overlay tracks."""

from __future__ import annotations

import math
import re
from typing import Any
from urllib.parse import urlparse

EDITORIAL_IDS = (
    "editorial-title", "editorial-data", "editorial-archive", "editorial-newspaper",
    "vertical-bar-chart", "line-chart", "before-after-split", "news-highlight",
    "doc-callout", "highlight-quote", "product-launch-fullscreen",
)
CHART_IDS = frozenset(("editorial-data", "vertical-bar-chart", "line-chart"))
LAYOUTS = {"title", "definition", "line", "bars", "annotated-chart", "comparison", "timeline", "article", "profile", "connections", "closing"}


def _plain(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


_NEGATED_EVIDENCE = re.compile(
    r"\b(?:no|not|never|without|uncited|unverified|unsupported|unconfirmed)\b|n['’]t\b",
    re.IGNORECASE,
)


def _summary_corroborates_source(source: str, summary: str) -> bool:
    """Conservative fallback when structured research sources are unavailable."""
    source_text = _plain(source).casefold()
    summary_text = _plain(summary).casefold()
    if not source_text or _NEGATED_EVIDENCE.search(summary_text):
        return False
    return bool(re.search(rf"(?<!\w){re.escape(source_text)}(?!\w)", summary_text))


def _composition(raw: dict, narration: str, source_text: str) -> dict:
    """Only admit quoted scene content, never reference/demo labels or links."""
    layout = str(raw.get("editorial_layout") or "")
    if layout not in LAYOUTS:
        return {}
    elements = []
    original_indexes = {}
    corpus = _plain(narration + " " + source_text).casefold()
    narration_text = _plain(narration).casefold()
    raw_elements = raw.get("editorial_elements")
    for index, item in enumerate(raw_elements[:6] if isinstance(raw_elements, list) else []):
        if not isinstance(item, dict):
            continue
        label, detail, evidence = (_plain(item.get(key)) for key in ("label", "detail", "evidence"))
        if not label or label.casefold() not in narration_text or len(evidence) < 12 or evidence.casefold() not in corpus:
            continue
        if detail and detail.casefold() not in narration_text:
            continue
        original_indexes[index] = len(elements)
        elements.append({"label": label[:60], **({"detail": detail[:140]} if detail else {})})
    links = []
    raw_links = raw.get("editorial_links")
    for item in raw_links[:6] if isinstance(raw_links, list) else []:
        if not isinstance(item, dict):
            continue
        a, b, evidence = item.get("from"), item.get("to"), _plain(item.get("evidence")).casefold()
        if type(a) is not int or type(b) is not int or a == b or a not in original_indexes or b not in original_indexes:
            continue
        if len(evidence) < 12 or evidence not in corpus:
            continue
        if any(elements[original_indexes[i]]["label"].casefold() not in evidence for i in (a, b)):
            continue
        links.append({"from": original_indexes[a], "to": original_indexes[b]})
    if layout in {"timeline", "comparison", "connections"} and len(elements) < 2:
        return {}
    if layout == "connections" and not links:
        return {}
    return {"documentary_layout": layout, **({"elements": elements} if elements else {}), **({"links": links} if links else {})}



def _values(raw: Any, narration: str, source: str) -> list[dict[str, Any]]:
    # A chart without a named source or corroboration in the narration would
    # silently invent evidence. Omit it instead of using gallery demo data.
    if not source or not isinstance(raw, list):
        return []
    result: list[dict[str, Any]] = []
    for entry in raw[:6]:
        if not isinstance(entry, dict):
            continue
        value = entry.get("value")
        label = str(entry.get("label") or "").strip()[:12]
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        # These templates use a zero baseline; a negative value needs a
        # different chart grammar and must not be shown as a positive bar.
        if not label or not math.isfinite(number) or number < 0 or number > 1_000_000_000:
            continue
        token = (str(int(number)) if number.is_integer() else str(number)).replace(",", "")
        if not re.search(rf"(?<![\d.]){re.escape(token)}(?![\d.])", narration.replace(",", "")):
            continue
        result.append({"label": label, "value": number})
    return result if len(result) >= 2 else []


def assign_editorial_a_roll(
    sections: list[dict[str, Any]], clips: list[dict[str, Any]],
    treatments: list[dict[str, Any]], *, max_scenes: int | None = None,
    media_refs: list[dict[str, Any]] | None = None,
    research_summary: str = "",
    research_sources: list[dict] | None = None,
    allowed_ids: set[str] | None = None,
) -> set[str]:
    """Mutate matching A-roll clips; return ids so B-roll/overlays can be skipped."""
    by_id = {str(s.get("id") or ""): s for s in sections if isinstance(s, dict)}
    selected: set[str] = set()
    selected_duration = 0.0
    target_duration = sum(max(0.0, float(c.get("duration_sec") or 0)) for c in clips) * 0.5
    for index, clip in enumerate(clips):
        if (max_scenes is not None and len(selected) >= max_scenes) or float(clip.get("duration_sec") or 0) < 3:
            continue
        sid = str(clip.get("scene_id") or "").removeprefix("scene-")
        section = by_id.get(sid) or {}
        raw = section.get("visual_treatment") or {}
        if not isinstance(raw, dict):
            raw = {}
        treatment = treatments[index] if index < len(treatments) and isinstance(treatments[index], dict) else {}
        editorial_pick = str(raw.get("editorial_template") or treatment.get("editorial_template") or "").strip().lower().replace("_", "-")
        graphic_pick = str(raw.get("motion_graphic") or treatment.get("motion_graphic") or "").strip().lower().replace("_", "-")
        # "none" is a deliberate content decision, not missing metadata.
        # Still honor a separate, explicit graphic request for this scene.
        preferred = editorial_pick if editorial_pick in EDITORIAL_IDS else graphic_pick
        if preferred not in EDITORIAL_IDS and (editorial_pick == "none" or graphic_pick == "none"):
            continue
        explicitly_selected = preferred in EDITORIAL_IDS
        if preferred not in EDITORIAL_IDS:
            narration_hint = str(section.get("narration") or "").lower()
            if index == 0:
                preferred = "editorial-title"
            elif selected_duration >= target_duration or index % 2 != 0:
                preferred = ""
            elif any(word in narration_hint for word in ("history", "ancient", "century", "kingdom", "archive")):
                preferred = "editorial-archive"
            elif any(word in narration_hint for word in ("compared", "versus", "before", "after")):
                preferred = "before-after-split"
            elif any(word in narration_hint for word in ("reported", "announced", "headline", "news")):
                preferred = "news-highlight"
            else:
                preferred = "editorial-newspaper" if index % 2 == 0 else "doc-callout"
        if not preferred or (allowed_ids is not None and preferred not in allowed_ids):
            continue
        if not explicitly_selected and selected_duration >= target_duration and index != 0:
            continue
        narration = str(section.get("narration") or "")
        source = str(raw.get("editorial_source") or "").strip()[:85]
        # A model-generated source name is not evidence. Match it to an actual
        # retrieved source and require every plotted number in its excerpt.
        matching = [s for s in (research_sources or []) if source and (
            source.casefold() in str(s.get("title") or "").casefold()
            or source.casefold() in str(s.get("url") or "").casefold()
        )]
        summary_match = not matching and _summary_corroborates_source(source, research_summary)
        source_is_corroborated = bool(matching) or summary_match
        source_text = " ".join(str(s.get("excerpt") or "") for s in matching)
        values = _values(raw.get("editorial_values"), narration, source)
        if matching:
            values = _values(values, source_text, source)
        elif not summary_match:
            values = []
        if preferred in CHART_IDS and not values:
            continue
        title = str(section.get("title") or "").strip()[:120]
        if not title:
            continue
        # Source media was already selected by the media pipeline. The renderer
        # uses this same clip.src as a contained editorial photo/video panel.
        template: dict[str, Any] = {
            "id": preferred,
            "title": title,
            "subtitle": re.sub(r"\s+", " ", narration).strip()[:190],
        }
        composition = _composition(raw, narration, source_text)
        if composition.get("documentary_layout") in {"line", "bars", "annotated-chart"} and not values:
            composition = {}
        template.update(composition)
        # The renderer component id is data in the timeline DSL, not an AI code
        # instruction. The native engine evaluates the supported template ids.
        if preferred == "editorial-title":
            template["motion_component"] = "kinetic_title"
        if source and source_is_corroborated:
            template["source_label"] = source
        elif media_refs and index < len(media_refs):
            ref = media_refs[index]
            # The hosted asset URL is storage, not the original publisher.
            media_source = str(ref.get("source_url") or "")
            host = urlparse(media_source).hostname if media_source else ""
            label = str(ref.get("title") or host or ref.get("provider") or ref.get("license") or "").strip()[:85]
            if label:
                template["source_label"] = label
        if values:
            template["values"] = values
        clip["motion_template"] = template
        # The layout owns its own motion; avoid a second Ken Burns/parallax.
        clip.pop("animation", None)
        selected.add(str(clip.get("id") or ""))
        selected_duration += float(clip.get("duration_sec") or 0)
    return selected
