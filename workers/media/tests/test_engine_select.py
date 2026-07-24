"""Unit tests — Remotion-only product path (editor / default)."""

from __future__ import annotations

from src.render.engine_select import resolve_render_engine, timeline_needs_remotion


def _base_manifest(**overrides: object) -> dict:
    m: dict = {
        "version": "1",
        "metadata": {
            "project_id": "p",
            "run_id": "r",
            "format_mode": "documentary",
            "resolution": {"width": 1920, "height": 1080},
            "fps": 30,
            "duration_sec": 10,
        },
        "tracks": {
            "video": [
                {
                    "id": "v1",
                    "scene_id": "s1",
                    "type": "image",
                    "src": "projects/p/scene.png",
                    "start_sec": 0,
                    "duration_sec": 5,
                },
                {
                    "id": "v2",
                    "scene_id": "s2",
                    "type": "image",
                    "src": "projects/p/scene2.png",
                    "start_sec": 5,
                    "duration_sec": 5,
                },
            ],
            "audio": [],
            "captions": [],
            "broll": [],
            "music": [],
        },
        "transitions": [],
        "overlays": [],
        "settings": {"captions_enabled": True},
    }
    m.update(overrides)
    return m


def test_hard_cuts_logged_but_still_need_false() -> None:
    needs, reason = timeline_needs_remotion(_base_manifest())
    assert needs is False
    assert reason == "hard_cuts_only"


def test_non_cut_transition_flagged() -> None:
    needs, reason = timeline_needs_remotion(
        _base_manifest(
            transitions=[
                {
                    "id": "t0",
                    "after_clip_id": "v1",
                    "type": "film-burn",
                    "duration_sec": 0.8,
                    "enabled": True,
                }
            ]
        )
    )
    assert needs is True
    assert "film-burn" in reason


def test_force_ffmpeg_still_available_for_ops() -> None:
    engine, decision = resolve_render_engine("ffmpeg", _base_manifest())
    assert engine == "ffmpeg"
    assert decision.startswith("forced_ffmpeg")


def test_auto_hard_cuts_uses_remotion() -> None:
    engine, decision = resolve_render_engine(
        "auto", _base_manifest(), render_service_configured=False
    )
    assert engine == "remotion-local"
    assert "remotion_only" in decision


def test_auto_with_render_service_uses_lambda() -> None:
    engine, decision = resolve_render_engine(
        "auto", _base_manifest(), render_service_configured=True
    )
    assert engine == "remotion-lambda"
    assert "render_service" in decision


def test_remotion_lambda_without_service_falls_back_local() -> None:
    engine, decision = resolve_render_engine(
        "remotion-lambda", _base_manifest(), render_service_configured=False
    )
    assert engine == "remotion-local"
    assert "no_render_service" in decision


def test_remotion_local_hard_cuts_stays_remotion() -> None:
    engine, decision = resolve_render_engine("remotion-local", _base_manifest())
    assert engine == "remotion-local"
    assert "remotion_only" in decision


def test_remotion_lambda_complex_stays_lambda() -> None:
    m = _base_manifest(
        overlays=[
            {
                "id": "o1",
                "type": "chapter_title",
                "text": "Ch 1",
                "start_sec": 0,
                "duration_sec": 2,
            }
        ]
    )
    engine, decision = resolve_render_engine("remotion-lambda", m)
    assert engine == "remotion-lambda"
    assert "render_service" in decision
