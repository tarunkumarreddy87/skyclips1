"""Unit tests for preset → FFmpeg mapping (no ffmpeg required)."""

from __future__ import annotations

from src.render.motion_filters import (
    build_clip_motion_filters,
    build_segment_vf,
    map_xfade_name,
    normalize_transition_type,
)


def test_normalize_and_map_xfade_types() -> None:
    assert normalize_transition_type("Wipe_Left") == "wipeleft"
    assert map_xfade_name("wipeleft") == "wipeleft"
    assert map_xfade_name("wipe-left") == "wipeleft"
    assert map_xfade_name("dissolve") == "dissolve"
    assert map_xfade_name("circleopen") == "circleopen"
    assert map_xfade_name("pixelize") == "pixelize"
    assert map_xfade_name("zoom") == "zoomin"
    assert map_xfade_name("slide-pan") == "smoothleft"
    assert map_xfade_name("unknown-thing") == "fade"


def test_identity_transform_adds_no_geometry() -> None:
    parts = build_clip_motion_filters(
        duration_sec=4.0,
        transform={"x": 50, "y": 50, "scaleX": 1, "scaleY": 1, "rotation": 0},
    )
    assert parts == []


def test_fade_in_out_relative_to_clip() -> None:
    parts = build_clip_motion_filters(
        duration_sec=5.0,
        animation={
            "in": {"preset": "fade", "duration_sec": 0.5},
            "out": {"preset": "fade", "duration_sec": 0.8},
        },
    )
    assert any(p.startswith("fade=t=in:st=0:d=0.500") for p in parts)
    assert any(p.startswith("fade=t=out:st=4.200") for p in parts)


def test_zoom_in_uses_zoompan() -> None:
    parts = build_clip_motion_filters(
        duration_sec=2.0,
        animation={"in": {"preset": "zoom_in", "duration_sec": 0.5}},
        fps=30,
    )
    assert any(p.startswith("zoompan=") for p in parts)
    assert any("fade=t=in" in p for p in parts)


def test_transform_scale_rotate_pad() -> None:
    parts = build_clip_motion_filters(
        duration_sec=3.0,
        transform={"x": 40, "y": 60, "scaleX": 0.5, "scaleY": 0.5, "rotation": 15},
    )
    joined = ",".join(parts)
    assert "scale=1920*0.5000:1080*0.5000" in joined
    assert "rotate=" in joined
    assert "c=black" in joined
    assert "pad=1920:1080:" in joined


def test_build_segment_vf_appends_motion() -> None:
    vf = build_segment_vf(
        fit="cover",
        duration_sec=3.0,
        animation={"in": {"preset": "fade", "duration_sec": 0.4}},
    )
    assert vf.startswith("scale=1920:1080:force_original_aspect_ratio=increase")
    assert "fade=t=in" in vf
