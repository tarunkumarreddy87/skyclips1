"""Tests for transition placement."""

from src.activities.timeline_transitions import (
    assign_transitions,
    build_chapter_title_overlays,
    detect_subscribe_overlay,
)
from src.activities.music_beds import pick_music_mood


def test_assign_transitions_about_thirty_percent():
    clips = [{"id": f"scene-{i}", "start_sec": i * 10.0, "duration_sec": 10.0} for i in range(12)]
    transitions = assign_transitions(clips, run_id="test-run-123", density=0.3)
    assert 3 <= len(transitions) <= 5
    types = {t["type"] for t in transitions}
    assert types.issubset({"zoom", "slide-pan", "film-burn", "glitch"})


def test_assign_transitions_per_scene_types():
    clips = [{"id": f"scene-{i}", "start_sec": i * 10.0, "duration_sec": 10.0} for i in range(4)]
    transitions = assign_transitions(
        clips,
        run_id="run-a",
        per_boundary_types=["zoom", "cut", "glitch"],
    )
    assert len(transitions) == 2
    assert transitions[0]["type"] == "zoom"
    assert transitions[1]["type"] == "glitch"

def test_subscribe_overlay_on_signoff():
    overlay = detect_subscribe_overlay(
        ["Intro.", "Body.", "Thanks for watching — subscribe for more!"],
        120.0,
    )
    assert overlay is not None
    assert overlay["type"] == "subscribe_cta"


def test_no_subscribe_without_signoff():
    assert detect_subscribe_overlay(["Just facts."], 60.0) is None


def test_chapter_titles_skip_intro():
    sections = [
        {"id": "a", "title": "Introduction"},
        {"id": "b", "title": "Eastern Front"},
        {"id": "c", "title": "Arsenal of Democracy"},
    ]
    clips = [
        {"id": "scene-a", "scene_id": "scene-a", "start_sec": 0.0, "duration_sec": 10.0},
        {"id": "scene-b", "scene_id": "scene-b", "start_sec": 10.0, "duration_sec": 10.0},
        {"id": "scene-c", "scene_id": "scene-c", "start_sec": 20.0, "duration_sec": 10.0},
    ]
    overlays = build_chapter_title_overlays(sections, clips)
    assert len(overlays) == 2
    assert overlays[0]["type"] == "chapter_title"
    assert overlays[0]["text"] == "Eastern Front"
    assert overlays[0]["start_sec"] == 10.0


def test_pick_music_mood_listicle_upbeat():
    assert pick_music_mood("listicle", {"sections": []}) == "upbeat"


def test_pick_music_mood_serious_keywords():
    script = {"sections": [{"title": "War", "narration": "The crisis and tragedy deepened."}]}
    assert pick_music_mood("documentary", script) == "serious"
