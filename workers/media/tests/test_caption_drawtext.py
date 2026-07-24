"""Unit helpers for caption wrap + drawtext filter bounds."""

from src.render.ffmpeg_pipeline import _build_drawtext_filters, _wrap_caption_lines


def test_wrap_caption_lines_bounded():
    lines = _wrap_caption_lines(" ".join(["abcdefghij"] * 12), max_chars=42, max_lines=2)
    assert len(lines) <= 2


def test_drawtext_overlays_only_not_captions():
    filters = _build_drawtext_filters(
        [{"text": "Short line one. Short line two continues here for wrap.", "start_sec": 0, "duration_sec": 2}],
        [],
        captions_enabled=True,
    )
    assert filters == []


def test_chapter_title_and_cta_overlays():
    filters = _build_drawtext_filters(
        [],
        [
            {"type": "chapter_title", "text": "Eastern Front", "start_sec": 5, "duration_sec": 2},
            {"type": "subscribe_cta", "text": "Subscribe", "start_sec": 50, "duration_sec": 4},
        ],
    )
    assert any("fontsize=52" in f for f in filters)
    assert any("0xE11D48" in f for f in filters)


def test_ass_caption_writer(tmp_path):
    from src.render.ffmpeg_pipeline import _write_captions_ass

    path = tmp_path / "c.ass"
    _write_captions_ass(
        [{"text": "Hello world from the eastern front today", "start_sec": 1.0, "duration_sec": 2.0}],
        path,
    )
    text = path.read_text(encoding="utf-8")
    assert "Dialogue:" in text
    assert "Hello" in text
