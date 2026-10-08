"""Bounded, explicit visual context for the timeline planning agent."""

from __future__ import annotations

import base64
import binascii
import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

JPEG_PREFIX = "data:image/jpeg;base64,"
MAX_JPEG_BYTES = 250_000


class EditorVisualEvidence(BaseModel):
    assetId: str = Field(min_length=1, max_length=200)
    timeMs: int = Field(ge=0)
    imageUrl: str = Field(max_length=334_000)

    @field_validator("imageUrl")
    @classmethod
    def validate_jpeg(cls, value: str) -> str:
        if not value.startswith(JPEG_PREFIX):
            raise ValueError("Video evidence must be a JPEG data URL")
        try:
            raw = base64.b64decode(value[len(JPEG_PREFIX):], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Invalid JPEG evidence encoding") from exc
        if len(raw) > MAX_JPEG_BYTES:
            raise ValueError("Video evidence exceeds 250 KB")
        if not raw.startswith(b"\xff\xd8\xff") or not raw.endswith(b"\xff\xd9"):
            raise ValueError("Invalid JPEG evidence")
        return value


def editor_user_content(payload: dict[str, Any], context: dict[str, Any]) -> str | list[dict[str, Any]]:
    """Keep frame bytes out of timeline JSON; give the vision model labeled images."""
    clean_payload = dict(payload)
    for key in ("timeline_context", "timeline"):
        timeline = clean_payload.get(key)
        if isinstance(timeline, dict):
            clean_payload[key] = {k: v for k, v in timeline.items() if k != "visualEvidence"}
    evidence = [EditorVisualEvidence.model_validate(v) for v in (context.get("visualEvidence") or [])[:3]]
    if not evidence:
        return json.dumps(clean_payload, ensure_ascii=False)
    content: list[dict[str, Any]] = [
        {"type": "text", "text": json.dumps(clean_payload, ensure_ascii=False)},
        {"type": "text", "text": "These are sampled frames only. Infer content from the visible frames; do not claim analysis of unsampled footage or invent chart facts."},
    ]
    for frame in evidence:
        content.append({"type": "text", "text": f"Asset {frame.assetId}, source time {frame.timeMs} ms:"})
        content.append({"type": "image_url", "image_url": {"url": frame.imageUrl, "detail": "low"}})
    return content
