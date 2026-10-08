"""Unit tests for Sarvam speaker / language resolution (no live API)."""

from __future__ import annotations

from src.clients.sarvam import resolve_speaker


def test_resolve_speaker_passes_through_valid_names() -> None:
    assert resolve_speaker("aditya") == "aditya"
    assert resolve_speaker("Kavya") == "kavya"
    assert resolve_speaker("shubh") == "shubh"


def test_resolve_speaker_maps_legacy_aliases() -> None:
    assert resolve_speaker("sarvam-hi") == "kavya"
    assert resolve_speaker("sarvam-en-in") == "aditya"
    assert resolve_speaker("sarvam-en-us") == "aditya"
    assert resolve_speaker("eleven-clive") == "shubh"
    assert resolve_speaker("hanuman-neutral") == "shubh"


def test_resolve_speaker_unknown_falls_back() -> None:
    assert resolve_speaker("not-a-real-speaker") == "shubh"
    assert resolve_speaker("") == "shubh"
    assert resolve_speaker(None) == "shubh"
