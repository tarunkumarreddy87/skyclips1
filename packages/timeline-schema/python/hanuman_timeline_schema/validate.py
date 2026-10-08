"""Validate the canonical JSON schema; never maintain a second Python schema."""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator, FormatChecker


@lru_cache(maxsize=1)
def _validator() -> Draft7Validator:
    bundled = Path(__file__).parent / "schema" / "timeline.v1.json"
    source = Path(__file__).resolve().parents[2] / "schema" / "timeline.v1.json"
    schema = json.loads((bundled if bundled.is_file() else source).read_text(encoding="utf-8"))
    return Draft7Validator(schema, format_checker=FormatChecker())


def validate_timeline(manifest: Any) -> list[str]:
    errors = [
        "/" + "/".join(map(str, error.absolute_path)) + ": " + error.message
        for error in _validator().iter_errors(manifest)
    ][:10]
    if errors:
        return errors
    ids: set[str] = set()
    for track, clips in manifest["tracks"].items():
        for index, clip in enumerate(clips):
            path = f"/tracks/{track}/{index}"
            if clip["id"] in ids or not clip["id"].strip():
                errors.append(f"{path}/id: Empty or duplicate element id")
            ids.add(clip["id"])
            if "three_scene" in clip:
                errors.extend(f"{path}/three_scene: {error}" for error in validate_three_scene(clip["three_scene"]))
    def finite(value: Any, path: str = "") -> None:
        if isinstance(value, float) and not math.isfinite(value):
            errors.append(f"{path}: Number must be finite")
        elif isinstance(value, dict):
            for key, child in value.items():
                finite(child, f"{path}/{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                finite(child, f"{path}/{index}")
    finite(manifest)
    return errors[:10]


def validate_three_scene(scene: Any) -> list[str]:
    schema = _validator().schema["definitions"]["threeScene"]
    errors = [error.message for error in Draft7Validator(schema).iter_errors(scene)][:10]
    if errors:
        return errors
    position = scene["camera"]["position"]
    target = scene["camera"].get("target", [0, 0, 0])
    if math.dist(position, target) < .01:
        errors.append("Camera must be away from its target")
    ids = set()
    for item in scene["objects"]:
        if item["id"] in ids:
            errors.append("Duplicate object id")
        ids.add(item["id"])
        frames = item.get("keyframes", [])
        if any(b["time_sec"] <= a["time_sec"] for a, b in zip(frames, frames[1:])):
            errors.append("Keyframe times must increase")
    def finite(value):
        if isinstance(value, (int, float)) and not math.isfinite(value):
            errors.append("Numbers must be finite")
        elif isinstance(value, dict):
            for child in value.values(): finite(child)
        elif isinstance(value, list):
            for child in value: finite(child)
    finite(scene)
    return errors[:10]


def format_errors(errors: list[str]) -> str:
    return "; ".join(errors)
