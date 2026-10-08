"""Compile bounded scene direction into editable graphics; never invent chart values."""
from __future__ import annotations

import math
import re
from typing import Any


def build_scene_graphic(section: dict[str, Any], clip: dict[str, Any]) -> dict[str, Any] | None:
    treatment = section.get("visual_treatment") or {}
    directive = treatment.get("graphic") if isinstance(treatment, dict) else None
    if not isinstance(directive, dict):
        return None
    kind = directive.get("type")
    if kind not in {"frame", "bar_chart", "shape"}:
        return None
    duration = min(6.0, float(clip["duration_sec"]))
    if duration < 1.0:
        return None
    obj: dict[str, Any] = {
        "id": f"graphic-{clip['id']}", "type": kind,
        "start_sec": float(clip["start_sec"]), "duration_sec": duration,
        "text": str(directive.get("text") or section.get("title") or "")[:120],
        "color": "#D4AF78", "width_pct": 60, "height_pct": 55,
        "transform": {"x": 50, "y": 45, "zIndex": 15},
        "animation": {"in": {"preset": "slide", "duration_sec": 0.6}, "out": {"preset": "fade", "duration_sec": 0.35}},
    }
    if kind == "frame":
        # Frame textures are still images; footage remains on its video track.
        if clip.get("type") != "image":
            return None
        obj["src"] = clip["src"]
        obj["keyframes"] = [
            {"time_sec": 0, "x": 50, "y": 45, "scale": 0.94},
            {"time_sec": duration, "x": 44, "y": 43, "scale": 1.0},
        ]
    elif kind == "shape":
        obj["shape"] = "circle" if directive.get("shape") == "circle" else "rectangle"
        obj["width_pct"], obj["height_pct"] = 20, 20
    else:
        data = directive.get("data")
        if not isinstance(data, list) or not 1 <= len(data) <= 12:
            return None
        # Require each numerical value to occur in the supplied narration.
        evidence = str(section.get("narration") or "")
        numbers = {float(n.replace(",", "")) for n in re.findall(r"\d[\d,]*(?:\.\d+)?", evidence)}
        rows = []
        for row in data:
            if not isinstance(row, dict) or isinstance(row.get("value"), bool):
                return None
            try:
                value = float(row["value"])
            except (ValueError, TypeError, KeyError):
                return None
            label = str(row.get("label") or "").strip()[:60]
            if not label or not math.isfinite(value) or value < 0 or value not in numbers:
                return None
            rows.append({"label": label, "value": value})
        obj["data"] = rows
    return obj
