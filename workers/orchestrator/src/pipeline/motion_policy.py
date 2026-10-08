"""Authoritative user constraints shared by agent planning and timeline assembly."""
from __future__ import annotations


def motion_mode(ctx: dict) -> str:
    mode = (ctx.get("motion_graphics") or {}).get("mode", "selected")
    if mode not in {"selected", "auto", "custom", "none"}:
        raise ValueError("Unknown motion graphics mode")
    return mode


def approved_templates(ctx: dict) -> list[dict]:
    mode = motion_mode(ctx)
    if mode in {"none", "custom"}:
        return []
    selected = set((ctx.get("motion_graphics") or {}).get("selectedTemplateIds") or [])
    return [t for t in ctx.get("uploaded_templates", []) if t.get("aiEnabled") and (not selected or t.get("id") in selected)]


def builtin_enabled(ctx: dict) -> bool:
    prefs = ctx.get("motion_graphics") or {}
    selected = set(prefs.get("selectedTemplateIds") or [])
    if motion_mode(ctx) == "selected" and selected and "press-cutout-v1" not in selected:
        return False
    return motion_mode(ctx) in {"selected", "auto"} and prefs.get("enabled") is True and prefs.get("templateId") == "press-cutout-v1"


def custom_allowed(ctx: dict) -> bool:
    return motion_mode(ctx) in {"auto", "custom"} and not ctx.get("disable_animations")
