"""Unit tests — S3 presign uses public endpoint when configured."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.pipeline import storage


def test_presigned_download_uses_public_client() -> None:
    public_client = MagicMock()
    public_client.generate_presigned_url.return_value = "https://public.example/key"
    internal_client = MagicMock()

    with (
        patch.object(storage, "_s3_public_client", return_value=public_client),
        patch.object(storage, "_s3_client", return_value=internal_client),
    ):
        url = storage.presigned_download_url("projects/p/asset.mp4")

    assert url == "https://public.example/key"
    public_client.generate_presigned_url.assert_called_once()
    internal_client.generate_presigned_url.assert_not_called()
