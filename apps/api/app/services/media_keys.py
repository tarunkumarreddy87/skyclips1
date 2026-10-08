"""Tenant scoping for S3 object keys referenced by timelines and editor documents.

Clip ``src`` values and editor asset keys come from the client. The API must never
presign, or hand to the renderer, an object key outside the caller's project: the
URL (or the rendered frame) would expose another tenant's media.
"""

from __future__ import annotations

import uuid
from typing import Any

# Not bucket object keys: external URLs, bundled static assets, colour placeholders
# and inline/browser-local data.
NON_OBJECT_PREFIXES = ("http://", "https://", "static:", "color:", "data:", "blob:")

# Timeline tracks whose clip ``src`` the renderer downloads.
TIMELINE_MEDIA_TRACKS = ("video", "audio", "broll", "music")


def project_key_prefix(project_id: uuid.UUID | str) -> str:
    return f"projects/{project_id}/"


def is_object_key(src: str) -> bool:
    """True when the renderer would resolve ``src`` as a bucket key (or local path)."""
    return bool(src) and not src.startswith(NON_OBJECT_PREFIXES)


def is_project_object_key(key: str, project_id: uuid.UUID | str) -> bool:
    """True for a plain object key inside this project's prefix, without traversal."""
    prefix = project_key_prefix(project_id)
    if not isinstance(key, str) or not key.startswith(prefix) or len(key) == len(prefix):
        return False
    if "\\" in key or any(ord(ch) < 32 for ch in key):
        return False
    return all(segment not in ("", ".", "..") for segment in key[len(prefix):].split("/"))


def timeline_clip_srcs(manifest: Any) -> list[str]:
    """Every clip ``src`` on the media tracks of a timeline.v1 manifest."""
    tracks = manifest.get("tracks") if isinstance(manifest, dict) else None
    if not isinstance(tracks, dict):
        return []
    srcs: list[str] = []
    for name in TIMELINE_MEDIA_TRACKS:
        clips = tracks.get(name)
        if not isinstance(clips, list):
            continue
        for clip in clips:
            src = clip.get("src") if isinstance(clip, dict) else None
            if isinstance(src, str) and src:
                srcs.append(src)
    for graphic in manifest.get("graphics", []):
        src = graphic.get("src") if isinstance(graphic, dict) else None
        if isinstance(src, str) and src:
            srcs.append(src)
    background = (manifest.get("settings") or {}).get("background_image")
    if isinstance(background, str) and background:
        srcs.append(background)
    for overlay in manifest.get("overlays", []):
        for src in overlay.get("image_refs", []) if isinstance(overlay, dict) else []:
            if isinstance(src, str) and src:
                srcs.append(src)
    for overlay in manifest.get("overlays", []):
        scene = overlay.get("scene") or {} if isinstance(overlay, dict) else {}
        for layer in scene.get("layers", []):
            src = layer.get("src") if isinstance(layer, dict) else None
            if isinstance(src, str) and src:
                srcs.append(src)
    for clip in tracks.get("video", []):
        template = clip.get("motion_template") or {} if isinstance(clip, dict) else {}
        html = template.get("html_template") or {}
        for asset in html.get("assets", []):
            src = asset.get("url") if isinstance(asset, dict) else None
            if isinstance(src, str) and src:
                srcs.append(src)
    return list(dict.fromkeys(srcs))


def foreign_editor_srcs(editor_document: Any, project_id: uuid.UUID | str) -> list[str]:
    """Bucket-like keys in the saved editor document that escape this project."""
    if not isinstance(editor_document, dict):
        return []
    assets = editor_document.get("assets")
    if not isinstance(assets, list):
        return []
    values: list[str] = []
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        metadata = asset.get("metadata")
        if isinstance(metadata, dict):
            values.extend(
                value
                for name in ("sourceKey", "proxyKey", "posterKey", "spriteKey")
                if isinstance((value := metadata.get(name)), str) and value
            )
        values.extend(
            value
            for name in ("url", "thumbnailUrl")
            if isinstance((value := asset.get(name)), str) and value
        )
    return [
        value
        for value in values
        if is_object_key(value) and not value.startswith("/")
        and not is_project_object_key(value, project_id)
    ]


def foreign_timeline_srcs(manifest: Any, project_id: uuid.UUID | str) -> list[str]:
    """Clip srcs the renderer would fetch from outside this project (or from local disk)."""
    return [
        src
        for src in timeline_clip_srcs(manifest)
        if is_object_key(src) and not is_project_object_key(src, project_id)
    ]
