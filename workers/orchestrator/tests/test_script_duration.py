"""Unit tests for script duration planning helpers."""

from src.activities.pipeline import (
    ENGLISH_CHARS_PER_SEC,
    MAX_SCRIPT_EXTENSION_PASSES,
    SCRIPT_CHUNK_TARGET_SEC,
    TARGET_FILL_RATIO,
    _estimate_spoken_sec,
    _section_hint_for_chunk,
)


def test_section_hint_scales_without_hard_20_cap():
    assert _section_hint_for_chunk(150) >= 5
    assert _section_hint_for_chunk(600) > 20
    assert _section_hint_for_chunk(2400) <= 90


def test_ten_minute_plan_uses_fewer_chunks_than_before():
    """150s chunks → 10 min needs 4 parts (was 7 at 90s) — fewer serial LLM calls."""
    target = 600
    part_count = max(1, (target + SCRIPT_CHUNK_TARGET_SEC - 1) // SCRIPT_CHUNK_TARGET_SEC)
    assert part_count == 4
    assert SCRIPT_CHUNK_TARGET_SEC >= 120
    assert MAX_SCRIPT_EXTENSION_PASSES >= 24
    assert TARGET_FILL_RATIO >= 0.95


def test_twenty_minute_plan_uses_multiple_chunks():
    target = 1200
    part_count = max(1, (target + SCRIPT_CHUNK_TARGET_SEC - 1) // SCRIPT_CHUNK_TARGET_SEC)
    assert part_count >= 8
    assert MAX_SCRIPT_EXTENSION_PASSES >= 24
    assert TARGET_FILL_RATIO >= 0.95


def test_estimate_spoken_sec_english_uses_17_5_cps():
    sections = [{"narration": "x" * 1750}]
    assert abs(_estimate_spoken_sec(sections, language="en") - 100.0) < 0.01
    assert ENGLISH_CHARS_PER_SEC == 17.5


def test_estimate_spoken_sec_indic_uses_14_cps():
    sections = [{"narration": "x" * 1400}]
    assert abs(_estimate_spoken_sec(sections, language="hi") - 100.0) < 0.01


def test_fill_gate_no_longer_systematically_undershoots_english():
    """Old bug: chars/12 * 0.88 → ~25% short at real English TTS rates."""
    target = 600.0
    # Minimum chars accepted by the new gate for English.
    min_chars = target * TARGET_FILL_RATIO * ENGLISH_CHARS_PER_SEC
    estimated_at_gate = min_chars / ENGLISH_CHARS_PER_SEC
    assert estimated_at_gate >= target * 0.95
