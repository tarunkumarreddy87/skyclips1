"""Tests for per-scene visual treatment variety."""

from src.activities.scene_visual_treatment import (
    animation_for_treatment,
    normalize_visual_treatment,
)


def test_consecutive_scenes_get_varied_motion():
    run_id = "variety-run"
    sections = [
        {"id": "intro", "title": "Opening Hook", "narration": "It began at dawn."},
        {"id": "storm", "title": "The Storm", "narration": "Tension rose as the crisis deepened."},
        {"id": "peace", "title": "Aftermath", "narration": "Calm returned to the quiet valley."},
        {"id": "end", "title": "Outro", "narration": "Thanks for watching."},
    ]
    motions = []
    for i, s in enumerate(sections):
        t = normalize_visual_treatment(
            None,
            section=s,
            index=i,
            total=len(sections),
            run_id=run_id,
        )
        motions.append(t["motion"])
        anim = animation_for_treatment(t, 8.0)
        assert anim is not None
    # Not all identical
    assert len(set(motions)) >= 2


def test_llm_treatment_respected():
    t = normalize_visual_treatment(
        {
            "mood": "climax",
            "motion": "zoom_in",
            "transition": "film-burn",
            "text_overlay": "chapter_title",
            "direction": "right-left",
        },
        section={"id": "battle", "title": "Battle", "narration": "War."},
        index=3,
        total=8,
        run_id="r1",
    )
    assert t["motion"] == "zoom_in"
    assert t["transition"] == "film-burn"
    assert t["text_overlay"] == "chapter_title"
    anim = animation_for_treatment(t, 10.0)
    assert anim["in"]["preset"] == "zoom_in"
