"""Channel language must never silently switch to the default narration language."""
import pytest
from src.clients.sarvam import resolve_target_language

@pytest.mark.parametrize("requested,expected", [
    ("te", "te-IN"), ("hi", "hi-IN"), ("ta", "ta-IN"),
    ("or", "od-IN"), ("od", "od-IN"), ("TE-in", "te-IN"),
    ("en-us", "en-IN"), ("en-in", "en-IN"),
])
def test_supported_channel_language(requested, expected):
    assert resolve_target_language(requested) == expected

@pytest.mark.parametrize("requested", ["fr", "es", "unknown", "fr-FR"])
def test_unsupported_language_does_not_become_english(requested):
    with pytest.raises(ValueError, match="not supported"):
        resolve_target_language(requested)
