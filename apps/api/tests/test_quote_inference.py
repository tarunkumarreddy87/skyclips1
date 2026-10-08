from app.db.models.enums import EntryPath, FormatMode
from app.services.quote_inference import infer_quote


class _Brief:
    def __init__(self, **kwargs):
        self.prompt_text = kwargs.get("prompt_text")
        self.script_text = kwargs.get("script_text")
        self.target_duration_sec = kwargs.get("target_duration_sec")
        self.language = kwargs.get("language", "en")
        self.model_id = kwargs.get("model_id", "hanuman-v1")
        self.brand_profile_id = kwargs.get("brand_profile_id", "bp-1")


class _Project:
    def __init__(self, format_mode: FormatMode, title: str = "Test"):
        self.format_mode = format_mode
        self.title = title


def test_documentary_infers_sections():
    project = _Project(FormatMode.DOCUMENTARY)
    brief = _Brief(prompt_text="Explore the deep ocean and its mysteries.")
    result = infer_quote(project, brief)
    assert result.format_mode == FormatMode.DOCUMENTARY
    assert result.duration_sec == 300
    assert len(result.section_outline) == 4


def test_listicle_parses_numbered_script():
    project = _Project(FormatMode.LISTICLE)
    brief = _Brief(script_text="1. First item\n2. Second item\n3. Third item")
    result = infer_quote(project, brief)
    assert result.duration_sec == 180
    titles = [s["title"] for s in result.section_outline]
    assert any("#1:" in t for t in titles)
    assert any("Conclusion" in s["title"] for s in result.section_outline)


def test_prompt_parses_30min_telugu():
    project = _Project(
        FormatMode.DOCUMENTARY,
        title="create a 30mins video about the world war2 in telugu language",
    )
    brief = _Brief(
        prompt_text="create a 30mins video about the world war2 in telugu language",
        language="en",
        target_duration_sec=300,
    )
    result = infer_quote(project, brief)
    assert result.duration_sec == 1800
    assert result.language == "te"
    assert result.warnings  # thin brief vs 30 min target


def test_density_warning_for_thin_30min_brief():
    project = _Project(FormatMode.DOCUMENTARY, title="Short topic")
    brief = _Brief(prompt_text="A quick note about coral reefs.")
    result = infer_quote(project, brief)
    assert result.duration_sec == 300
    assert not result.warnings

    project_long = _Project(FormatMode.DOCUMENTARY, title="30 minute coral doc")
    brief_long = _Brief(
        prompt_text="The history of coral reefs and climate change.",
        target_duration_sec=1800,
    )
    result_long = infer_quote(project_long, brief_long)
    assert result_long.duration_sec == 1800
    assert any("talking point" in w.lower() for w in result_long.warnings)


def test_credit_estimate_charges_for_each_started_video_minute():
    project = _Project(FormatMode.DOCUMENTARY, title="Ocean story")
    for duration_sec, expected_credits in ((1, 24), (60, 24), (61, 48), (120, 48)):
        brief = _Brief(target_duration_sec=duration_sec)
        assert infer_quote(project, brief).credit_estimate == expected_credits
