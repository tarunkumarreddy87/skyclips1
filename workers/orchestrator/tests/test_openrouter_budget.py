from src.clients.openrouter import (
    _is_nvidia_integrate,
    clamp_token_budget,
    model_candidates,
    provider_token_ceiling,
)


def test_token_budget_clamps_to_local_credit_ceiling() -> None:
    assert clamp_token_budget(800, 700) == 700
    assert clamp_token_budget(500, 700) == 500


def test_token_budget_keeps_a_valid_minimum() -> None:
    assert clamp_token_budget(10, 10) == 64


def test_provider_limit_retries_below_available_credit() -> None:
    assert provider_token_ceiling("You requested up to 700 tokens, but can only afford 340 tokens.", 700) == 316
    assert provider_token_ceiling("different 402", 700) is None


def test_model_candidates_prefer_the_selected_model_then_a_unique_fallback() -> None:
    assert model_candidates("nvidia/nemotron:free", "nvidia/lightning:free,openrouter/free") == (
        "nvidia/nemotron:free",
        "nvidia/lightning:free",
        "openrouter/free",
    )
    assert model_candidates("openrouter/free", "openrouter/free") == ("openrouter/free",)


def test_nvidia_endpoint_is_detected_for_provider_specific_request_limits() -> None:
    assert _is_nvidia_integrate("https://integrate.api.nvidia.com/v1")
    assert not _is_nvidia_integrate("https://openrouter.ai/api/v1")
