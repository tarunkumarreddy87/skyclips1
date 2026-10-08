import asyncio
import socket
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.clients import web_media as web


@pytest.mark.parametrize("url", [
    "http://example.com/a.jpg", "https://localhost/a", "https://127.0.0.1/a",
    "https://[::1]/a", "https://169.254.169.254/a", "https://example.com:444/a",
    "https://user:password@example.com/a", "file:///etc/passwd", "https://foo.local/a",
])
def test_rejects_unsafe_urls(url):
    with pytest.raises(web.WebMediaError):
        web.public_host(url, [])


def test_blocked_domains_include_subdomains_not_similar_names():
    for url in ["https://example.com/x", "https://cdn.example.com/x"]:
        with pytest.raises(web.WebMediaError):
            web.public_host(url, ["https://EXAMPLE.com/page"])
    assert web.public_host("https://notexample.com/x", ["example.com"]) == "notexample.com"


def test_private_dns_never_connects():
    with patch.object(socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("10.1.2.3", 443))]), patch.object(web, "_PinnedHTTPS") as connection:
        with pytest.raises(web.WebMediaError):
            web._get("https://example.com/x", [], 100)
        connection.assert_not_called()


def test_redirect_is_checked_before_next_connection():
    response = MagicMock(status=302)
    response.getheader.return_value = "https://127.0.0.1/private"
    with patch.object(socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("8.8.8.8", 443))]), patch.object(web, "_PinnedHTTPS") as connection:
        connection.return_value.getresponse.return_value = response
        with pytest.raises(web.WebMediaError):
            web._get("https://example.com/x", [], 100)
        assert connection.call_count == 1


def test_cross_host_media_redirect_rejected_before_connect():
    with patch.object(web, "_PinnedHTTPS") as connection:
        with pytest.raises(web.WebMediaError):
            web._get("https://other.com/a", [], 100, same_host="example.com")
        connection.assert_not_called()


def test_robots_disallow_and_non_image_are_rejected():
    with patch.object(web, "_get", return_value=(200, "text/plain", b"User-agent: *\nDisallow: /", "https://example.com/robots.txt")) as get:
        with pytest.raises(web.WebMediaError):
            web._download("https://example.com/a.jpg", [])
        assert get.call_count == 1
    with patch.object(web, "_get", side_effect=[(404, "", b"", ""), (200, "image/jpeg", b"<html>no</html>", "https://example.com/a.jpg")]):
        with pytest.raises(web.WebMediaError):
            web._download("https://example.com/a.jpg", [])


def test_search_uses_requested_sdk_parameters_filters_and_deduplicates(monkeypatch):
    monkeypatch.setattr(web.settings, "serpapi_api_key", "test-secret")
    with patch.object(web.serpapi, "Client") as client:
        client.return_value.search.return_value = {"images_results": [
            {"original": "https://cdn.example.com/a.jpg", "link": "https://example.com/page"},
            {"original": "https://cdn.example.com/a.jpg", "link": "https://example.com/duplicate"},
            {"original": "https://blocked.com/b.jpg", "link": "https://example.com/page"},
            {"original": "https://cdn.example.com/c.jpg", "link": "https://blocked.com/page"},
        ]}
        results = asyncio.run(web.search_images("flowers", ["blocked.com"]))
        assert len(results) == 1
        params = client.return_value.search.call_args.args[0]
        assert params == {"engine": "google_images", "google_domain": "google.com", "q": "flowers", "hl": "en", "gl": "us", "safe": "active"}
        client.return_value.search.side_effect = RuntimeError("URL contains test-secret")
        with pytest.raises(web.WebMediaError) as error:
            asyncio.run(web.search_images("flowers", []))
        assert "test-secret" not in str(error.value)


def test_fetch_skips_failed_candidate_and_marks_unknown_license():
    candidates = [{"id": "a", "url": "https://example.com/a"}, {"id": "b", "url": "https://example.com/b"}]
    with patch.object(web, "search_images", AsyncMock(return_value=candidates)), patch.object(web, "_download", side_effect=[web.WebMediaError("unavailable"), (b"image", "jpg", "https://example.com/b")]):
        result = asyncio.run(web.fetch_web_image("flowers", [], set(), asyncio.Lock()))
        assert result["id"] == "b"
        assert result["license"] == "unknown"
        assert result["requires_license_review"] is True


def test_broll_never_uses_disabled_stock():
    from src.activities import pipeline
    with patch.object(pipeline, "_fetch_web_asset", AsyncMock(return_value=None)), patch.object(pipeline, "search_photos", AsyncMock()) as stock:
        result = asyncio.run(pipeline._fetch_secondary_broll({"general_web_crawling": True, "commercial_stock": False}, section_id="1", query="flowers", used_photo_ids=set()))
        assert result == {}
        stock.assert_not_called()


def test_broll_web_toggle_off_does_not_call_serpapi():
    from src.activities import pipeline
    with patch.object(pipeline, "_fetch_web_asset", AsyncMock()) as web_fetch:
        result = asyncio.run(pipeline._fetch_secondary_broll({"general_web_crawling": False, "commercial_stock": False}, section_id="1", query="flowers", used_photo_ids=set()))
        assert result == {}
        web_fetch.assert_not_called()


def test_source_configuration_fails_before_paid_generation(monkeypatch):
    from src.activities import pipeline
    monkeypatch.setattr(pipeline.settings, "hanuman_stub_mode", False)
    monkeypatch.setattr(pipeline.settings, "serpapi_api_key", "")
    with pytest.raises(web.WebMediaError, match="SERPAPI_API_KEY"):
        pipeline._validate_media_sourcing({"general_web_crawling": True})
    with pytest.raises(web.WebMediaError, match="Choose AI images"):
        pipeline._validate_media_sourcing({"commercial_stock": False})
    pipeline._validate_media_sourcing({})  # Legacy requests retain stock defaults.


def test_download_size_limit():
    response = MagicMock(status=200)
    response.getheader.side_effect = lambda name, default=None: "9999" if name == "Content-Length" else default
    with patch.object(socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("8.8.8.8", 443))]), patch.object(web, "_PinnedHTTPS") as connection:
        connection.return_value.getresponse.return_value = response
        with pytest.raises(web.WebMediaError, match="size limit"):
            web._get("https://example.com/x", [], 100)
        response.read.assert_not_called()


def test_robots_redirect_path_checked_before_connect():
    with patch.object(web, "_PinnedHTTPS") as connection:
        with pytest.raises(web.WebMediaError, match="disallows"):
            web._get("https://example.com/private", [], 100, allowed=lambda url: False)
        connection.assert_not_called()


def test_web_asset_preserves_attribution_in_scene_artifact():
    from src.activities import pipeline
    image = {"data": b"jpeg", "extension": "jpg", "url": "https://cdn.example.com/a.jpg",
             "source_url": "https://example.com/page", "title": "Flowers", "provider": "serpapi",
             "license": "unknown", "requires_license_review": True}
    with patch.object(pipeline, "fetch_web_image", AsyncMock(return_value=image)), patch.object(pipeline, "put_bytes") as store:
        result = asyncio.run(pipeline._fetch_web_asset({"project_id": "p", "run_id": "r"}, "s", "flowers", set(), asyncio.Lock()))
        assert result["source_url"] == image["source_url"]
        assert result["requires_license_review"] is True
        assert result["type"] == "web_image"
        store.assert_called_once_with(result["s3_key"], b"jpeg", "image/jpeg")
