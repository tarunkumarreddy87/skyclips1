from src.clients.media_relevance import rank_media


def test_related_description_beats_first_provider_hit():
    unrelated = {"id": 1, "alt": "People working on a laptop", "url": "https://example.com/office/"}
    related = {"id": 2, "alt": "Chola bronze temple sculpture", "url": "https://example.com/temple/"}
    assert rank_media([unrelated, related], "Chola temple sculpture documentary")[0]["id"] == 2


def test_video_page_slug_is_used_and_ties_stay_stable():
    a = {"id": 1, "url": "https://example.com/video/ocean-waves-123/"}
    b = {"id": 2, "url": "https://example.com/video/temple-sculpture-456/"}
    assert rank_media([a, b], "temple sculpture")[0] == b
    assert rank_media([a, b], "unmatched subject") == [a, b]
