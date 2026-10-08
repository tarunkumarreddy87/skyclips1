"""Unit tests for preview proxy key naming + service helpers (no S3/ffmpeg)."""

import asyncio
import subprocess
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services.storage import StorageService

from app.services.proxy_media_service import (
    ProxyMediaService,
    poster_key_for,
    proxy_key_for,
    sprite_key_for,
)


def test_proxy_key_naming():
    src = "projects/abc/uploads/clip.mp4"
    assert proxy_key_for(src) == "projects/abc/uploads/clip.mp4.proxy.mp4"
    assert poster_key_for(src) == "projects/abc/uploads/clip.mp4.poster.jpg"
    assert sprite_key_for(src) == "projects/abc/uploads/clip.mp4.sprite.jpg"


class _FakeStorage:
    """Records HEAD lookups and presigns to a deterministic URL."""

    def __init__(self, present: set[str]):
        self.present = present
        self.bucket = "test"
        self.client = self

    def head_object(self, Bucket: str, Key: str):  # noqa: N803 — boto3 kwarg casing
        if Key not in self.present:
            raise FileNotFoundError(Key)
        return {"ContentLength": 1}

    def public_download_url(self, key: str) -> str:
        return f"https://cdn.test/{key}"


def test_existing_proxies_returns_urls_when_derived():
    src = "projects/abc/uploads/clip.mp4"
    storage = _FakeStorage({proxy_key_for(src), poster_key_for(src)})
    found = ProxyMediaService(storage).existing_proxies(src)
    assert found is not None
    assert found["proxyKey"] == proxy_key_for(src)
    assert found["proxyUrl"] == f"https://cdn.test/{proxy_key_for(src)}"
    # Sprite is optional — absent means the key is simply omitted.
    assert "spriteKey" not in found


def test_existing_proxies_none_when_proxy_missing():
    src = "projects/abc/uploads/clip.mp4"
    storage = _FakeStorage({poster_key_for(src)})
    assert ProxyMediaService(storage).existing_proxies(src) is None


def test_existing_proxies_rejects_non_keys():
    storage = _FakeStorage(set())
    assert ProxyMediaService(storage).existing_proxies("https://example.com/a.mp4") is None
    assert ProxyMediaService(storage).existing_proxies("color:#000") is None


def test_derive_route_streams_internal_source_and_returns_public_proxy_urls(monkeypatch):
    from app.api.routes import media_proxies as route
    from app.services import proxy_media_service, storage as storage_module
    project_id = uuid.uuid4()
    source_key = f"projects/{project_id}/uploads/source.mp4"
    storage = StorageService.__new__(StorageService)
    storage.bucket = "test"
    storage.client = MagicMock()
    storage.public_client = MagicMock()
    storage.client.head_object.side_effect = FileNotFoundError("not derived")
    storage.client.generate_presigned_url.return_value = f"http://minio:9000/test/{source_key}?signed=internal"
    storage.public_client.generate_presigned_url.side_effect = lambda _, **kwargs: (
        f"http://localhost:9000/test/{kwargs['Params']['Key']}?signed=public")
    service = SimpleNamespace(get_project=AsyncMock())
    user = SimpleNamespace(id=uuid.uuid4())
    monkeypatch.setattr(route, "ffmpeg_available", lambda: True)
    monkeypatch.setattr(proxy_media_service, "ffmpeg_available", lambda: True)
    monkeypatch.setattr(storage_module.settings, "media_cdn_base_url", "")
    inputs = []
    def encode(cmd, *, allow_fail=False):
        inputs.append(cmd[cmd.index("-i") + 1])
        Path(cmd[-1]).write_bytes(b"derived-media")
    monkeypatch.setattr(ProxyMediaService, "_run_ffmpeg", staticmethod(encode))
    result = asyncio.run(route.derive_media_proxies(project_id,
        route.DeriveProxiesRequest(sourceKey=source_key, makeSprite=False), user, service, storage))
    service.get_project.assert_awaited_once_with(user, project_id)
    assert len(inputs) == 2 and all(url.startswith("http://minio:9000/") for url in inputs)
    storage.client.generate_presigned_url.assert_called_once_with("get_object",
        Params={"Bucket": "test", "Key": source_key}, ExpiresIn=3600)
    storage.client.get_object.assert_not_called()
    assert result.proxy_url.startswith("http://localhost:9000/")
    assert result.poster_url.startswith("http://localhost:9000/")
    assert storage.client.put_object.call_count == 2


def test_derive_route_rejects_cross_project_key_before_signing(monkeypatch):
    from app.api.routes import media_proxies as route
    project_id = uuid.uuid4()
    storage = MagicMock()
    service = SimpleNamespace(get_project=AsyncMock())
    with pytest.raises(HTTPException) as error:
        asyncio.run(route.derive_media_proxies(project_id,
            route.DeriveProxiesRequest(sourceKey=f"projects/{uuid.uuid4()}/uploads/source.mp4"),
            SimpleNamespace(id=uuid.uuid4()), service, storage))
    assert error.value.status_code == 400
    storage.presigned_internal_download_url.assert_not_called()


def test_derive_bounds_ffmpeg_threads_and_preserves_first_frame_poster_fallback(monkeypatch):
    from app.services import proxy_media_service as module
    storage = MagicMock()
    storage.bucket = "test"
    storage.client.head_object.side_effect = FileNotFoundError("not derived")
    storage.public_download_url.side_effect = lambda key: f"https://public.test/{key}"
    monkeypatch.setattr(module, "ffmpeg_available", lambda: True)
    commands = []
    def run(command, **kwargs):
        commands.append(command)
        # Short footage has no frame at t=1: keep the real first-frame fallback.
        if "-ss" in command:
            return subprocess.CompletedProcess(command, 1, "", "No frame at requested time")
        Path(command[-1]).write_bytes(b"encoded")
        return subprocess.CompletedProcess(command, 0, "", "")
    monkeypatch.setattr(module.subprocess, "run", run)
    result = ProxyMediaService(storage).derive_proxies("projects/p/short.mp4",
        make_sprite=True, presigned_url="http://minio:9000/test/short.mp4")
    assert len(commands) == 4
    assert sum("-ss" in command for command in commands) == 1
    assert all(command[command.index("-threads:v") + 1] == "1" for command in commands)
    assert all(command[command.index("-filter_threads") + 1] == "1" for command in commands)
    assert all(command[command.index("-filter_complex_threads") + 1] == "1" for command in commands)
    assert all(command[command.index("-threads") + 1] == "1" and command.index("-threads") < command.index("-i") for command in commands)
    jpeg_commands = [command for command in commands if command[-1].endswith(".jpg")]
    assert len(jpeg_commands) == 3
    assert all(command[command.index("-pix_fmt") + 1] == "yuvj420p" for command in jpeg_commands)
    assert commands[0][commands[0].index("-pix_fmt") + 1] == "yuv420p"
    assert storage.upload_bytes.call_count == 3
    assert result["posterKey"].endswith(".poster.jpg") and result["spriteKey"].endswith(".sprite.jpg")


def test_required_proxy_or_poster_encode_failure_still_raises(monkeypatch):
    from app.services import proxy_media_service as module
    monkeypatch.setattr(module.subprocess, "run", lambda command, **kwargs:
        subprocess.CompletedProcess(command, 1, "", "MJPEG encoder failed"))
    with pytest.raises(RuntimeError, match="MJPEG encoder failed"):
        ProxyMediaService._run_ffmpeg(["ffmpeg", "-i", "input", "poster.jpg"])
    ProxyMediaService._run_ffmpeg(["ffmpeg", "-i", "input", "optional-sprite.jpg"], allow_fail=True)
