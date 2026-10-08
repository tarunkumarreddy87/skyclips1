"""Storage Cache-Control + CDN public URL helpers."""

from unittest.mock import MagicMock, patch

from app.services.storage import (
    CACHE_CONTROL_DERIVED_MEDIA,
    CACHE_CONTROL_IMMUTABLE,
    StorageService,
)


def test_cache_control_constants():
    assert "max-age=86400" in CACHE_CONTROL_DERIVED_MEDIA
    assert "immutable" in CACHE_CONTROL_IMMUTABLE


def test_upload_bytes_sets_cache_control():
    svc = StorageService.__new__(StorageService)
    svc.bucket = "hanuman-artifacts"
    svc.client = MagicMock()
    svc.public_client = MagicMock()

    svc.upload_bytes(
        "projects/a/clip.mp4.poster.jpg",
        b"jpeg",
        "image/jpeg",
        cache_control=CACHE_CONTROL_DERIVED_MEDIA,
    )

    svc.client.put_object.assert_called_once()
    kwargs = svc.client.put_object.call_args.kwargs
    assert kwargs["CacheControl"] == CACHE_CONTROL_DERIVED_MEDIA
    assert kwargs["ContentType"] == "image/jpeg"
    assert kwargs["Key"] == "projects/a/clip.mp4.poster.jpg"


def test_upload_bytes_omits_cache_control_when_unset():
    svc = StorageService.__new__(StorageService)
    svc.bucket = "hanuman-artifacts"
    svc.client = MagicMock()
    svc.public_client = MagicMock()

    svc.upload_bytes("projects/a/doc.json", b"{}", "application/json")

    kwargs = svc.client.put_object.call_args.kwargs
    assert "CacheControl" not in kwargs


def test_public_download_url_uses_cdn_when_configured():
    svc = StorageService.__new__(StorageService)
    svc.bucket = "hanuman-artifacts"
    svc.client = MagicMock()
    svc.public_client = MagicMock()

    with patch("app.services.storage.settings") as settings:
        settings.media_cdn_base_url = "https://cdn.example.com/"
        url = svc.public_download_url("projects/p/asset.mp4.proxy.mp4")

    assert url == "https://cdn.example.com/projects/p/asset.mp4.proxy.mp4"
    svc.public_client.generate_presigned_url.assert_not_called()


def test_public_download_url_falls_back_to_presign():
    svc = StorageService.__new__(StorageService)
    svc.bucket = "hanuman-artifacts"
    svc.client = MagicMock()
    svc.public_client = MagicMock()
    svc.public_client.generate_presigned_url.return_value = "https://s3.example/signed"

    with patch("app.services.storage.settings") as settings:
        settings.media_cdn_base_url = ""
        url = svc.public_download_url("projects/p/asset.mp4")

    assert url == "https://s3.example/signed"
    svc.public_client.generate_presigned_url.assert_called_once()

def test_browser_upload_uses_public_endpoint():
    svc = StorageService.__new__(StorageService)
    svc.bucket = "hanuman-artifacts"
    svc.client = MagicMock()
    svc.public_client = MagicMock()
    svc.public_client.generate_presigned_url.return_value = "http://localhost:9000/upload"
    assert svc.presigned_upload_url(s3_key="projects/p/photo.png", content_type="image/png") == "http://localhost:9000/upload"
    svc.client.generate_presigned_url.assert_not_called()
    svc.public_client.generate_presigned_url.assert_called_once_with("put_object", Params={"Bucket": "hanuman-artifacts", "Key": "projects/p/photo.png", "ContentType": "image/png"}, ExpiresIn=3600)


def test_server_download_signs_internal_client_without_changing_browser_urls():
    svc = StorageService.__new__(StorageService)
    svc.bucket = "hanuman-artifacts"
    svc.client = MagicMock()
    svc.public_client = MagicMock()
    svc.client.generate_presigned_url.return_value = "http://minio:9000/server-read"
    svc.public_client.generate_presigned_url.return_value = "http://localhost:9000/browser-read"
    key = "projects/p/video.mp4"
    assert svc.presigned_internal_download_url(key, expires_in=900) == "http://minio:9000/server-read"
    svc.client.generate_presigned_url.assert_called_once_with("get_object",
        Params={"Bucket": "hanuman-artifacts", "Key": key}, ExpiresIn=900)
    svc.public_client.generate_presigned_url.assert_not_called()
    assert svc.presigned_download_url(key) == "http://localhost:9000/browser-read"
