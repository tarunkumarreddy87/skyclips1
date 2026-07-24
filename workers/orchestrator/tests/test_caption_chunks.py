"""Caption chunking for subtitle-sized burn-in."""

from src.activities.caption_chunks import (
    captions_from_tts_pieces,
    chunk_narration_for_captions,
    estimate_word_timings,
    wrap_caption_lines,
    word_speak_weight,
)


def test_wrap_caption_max_two_lines():
    text = " ".join(["word"] * 40)
    lines = wrap_caption_lines(text, max_chars=42, max_lines=2)
    assert 1 <= len(lines) <= 2
    assert all(len(line) <= 43 for line in lines)  # allow ellipsis


def test_chunk_narration_splits_long_section():
    narration = (
        "The eastern front collapsed under pressure. "
        "Factories turned to the arsenal of democracy overnight. "
        "Allies crossed the channel and rewrote the map of Europe."
    )
    caps = chunk_narration_for_captions(
        narration,
        start_sec=10.0,
        duration_sec=30.0,
        section_id="s1",
        clip_id="scene-s1",
    )
    assert len(caps) >= 2
    assert caps[0]["start_sec"] == 10.0
    end = caps[-1]["start_sec"] + caps[-1]["duration_sec"]
    assert abs(end - 40.0) < 0.05
    assert all(len(c["text"]) <= 90 for c in caps)
    for c in caps:
        assert "words" in c and len(c["words"]) >= 1
        w_end = c["words"][-1]["start_sec"] + c["words"][-1]["duration_sec"]
        assert abs(w_end - (c["start_sec"] + c["duration_sec"])) < 0.05


def test_estimate_word_timings_sums_to_duration():
    words = estimate_word_timings("Hello, world — again.", start_sec=1.0, duration_sec=2.0)
    assert len(words) >= 3
    assert words[0]["start_sec"] == 1.0
    end = words[-1]["start_sec"] + words[-1]["duration_sec"]
    assert abs(end - 3.0) < 0.001
    assert abs(sum(w["duration_sec"] for w in words) - 2.0) < 0.001


def test_punctuation_slows_clause_end():
    """Words ending a sentence get more time than mid-clause fillers."""
    words = estimate_word_timings("Go now. Wait here", start_sec=0.0, duration_sec=4.0)
    by_text = {w["text"]: w["duration_sec"] for w in words}
    # "now." should outlast "Go" (extra clause pause weight).
    assert by_text["now."] > by_text["Go"]


def test_captions_from_tts_pieces_lock_to_piece_clocks():
    pieces = [
        {"text": "First sentence spoken by TTS.", "duration_sec": 2.5},
        {
            "text": "Second longer sentence that keeps going across more words for cover.",
            "duration_sec": 4.0,
        },
    ]
    caps = captions_from_tts_pieces(
        pieces,
        start_sec=5.0,
        section_id="s1",
        clip_id="scene-s1",
    )
    assert caps
    assert caps[0]["start_sec"] == 5.0
    end = caps[-1]["start_sec"] + caps[-1]["duration_sec"]
    assert abs(end - 11.5) < 0.05
    # First piece text only appears in captions that start before second piece
    first_end = 5.0 + 2.5
    first_caps = [c for c in caps if c["start_sec"] < first_end - 0.01]
    assert first_caps
    assert all("First" in c["text"] or "sentence" in c["text"].lower() for c in first_caps)
    assert abs(sum(c["duration_sec"] for c in first_caps) - 2.5) < 0.05


def test_word_speak_weight_clause_vs_short():
    assert word_speak_weight("ending.") > word_speak_weight("of")
