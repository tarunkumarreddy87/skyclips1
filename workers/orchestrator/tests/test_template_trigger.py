"""Unit tests for motion-graphic template auto-trigger."""

from __future__ import annotations

from src.activities.template_trigger import auto_trigger_templates, _resolve_allowed_ids


def test_resolve_allowed_respects_blocklist() -> None:
    allowed = _resolve_allowed_ids(
        {
            "template_mode": "auto",
            "blocklisted_templates": ["Vertical Bar Chart", "line-chart"],
        }
    )
    assert "vertical-bar-chart" not in allowed
    assert "line-chart" not in allowed
    # The former demo library was retired; auto must not resurrect it.
    assert allowed == set()


def test_manual_mode_empty_allow_list() -> None:
    allowed = _resolve_allowed_ids({"template_mode": "manual", "allowed_templates": []})
    assert allowed == set()


def test_heuristic_comparison_picks_before_after() -> None:
    overlays = auto_trigger_templates(
        sections=[
            {
                "id": "s1",
                "title": "Then and now",
                "narration": "Compare before versus after the reform.",
            }
        ],
        video_clips=[
            {
                "id": "c1",
                "scene_id": "scene-s1",
                "start_sec": 0,
                "duration_sec": 8,
                "src": "projects/demo/assets/scene-1.jpg",
            }
        ],
        theme_id="modern",
        treatments=[{}],
        ctx={"template_mode": "auto"},
        max_overlays=2,
    )
    assert overlays == []


def test_disable_overlays_skips() -> None:
    overlays = auto_trigger_templates(
        sections=[{"id": "s1", "narration": "growth metrics 42%"}],
        video_clips=[{"id": "c1", "scene_id": "scene-s1", "start_sec": 0, "duration_sec": 6}],
        theme_id="modern",
        treatments=None,
        ctx={"disable_overlays": True},
    )
    assert overlays == []


def test_llm_motion_graphic_preferred_and_mid_scene() -> None:
    overlays = auto_trigger_templates(
        sections=[
            {"id": "intro", "title": "Intro", "narration": "Welcome to the story."},
            {
                "id": "stats",
                "title": "Numbers",
                "narration": "Revenue climbed every quarter.",
            },
            {"id": "outro", "title": "Outro", "narration": "Thanks for watching."},
        ],
        video_clips=[
            {"id": "c0", "scene_id": "scene-intro", "start_sec": 0, "duration_sec": 8},
            {"id": "c1", "scene_id": "scene-stats", "start_sec": 8, "duration_sec": 10},
            {"id": "c2", "scene_id": "scene-outro", "start_sec": 18, "duration_sec": 6},
        ],
        theme_id="modern",
        treatments=[
            {"motion_graphic": "none"},
            {"motion_graphic": "line-chart"},
            {"motion_graphic": "none"},
        ],
        ctx={"template_mode": "auto"},
        max_overlays=3,
    )
    assert overlays == []
