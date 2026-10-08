"""Derive browser-preview proxies (540p H.264), posters, and optional sprites.

Editor preview + timeline thumbs should prefer these over full original MP4s.
Export / durable manifest paths continue to use originals (sourceKey).

Runs FFmpeg locally in the API process (MVP). Requires ffmpeg/ffprobe on PATH
(API Docker image installs them). Media-worker Temporal activity can reuse the
same key naming later without changing client metadata contracts.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.services.storage import CACHE_CONTROL_DERIVED_MEDIA, StorageService

logger = logging.getLogger(__name__)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def proxy_key_for(source_key: str) -> str:
    return f"{source_key}.proxy.mp4"


def poster_key_for(source_key: str) -> str:
    return f"{source_key}.poster.jpg"


def sprite_key_for(source_key: str) -> str:
    return f"{source_key}.sprite.jpg"


class ProxyMediaService:
    def __init__(self, storage: StorageService) -> None:
        self.storage = storage

    def object_exists(self, s3_key: str) -> bool:
        try:
            self.storage.client.head_object(Bucket=self.storage.bucket, Key=s3_key)
            return True
        except Exception:
            return False

    def existing_proxies(self, source_key: str) -> dict[str, str] | None:
        """Presigned URLs for already-derived proxies, or None when a re-derive is needed."""
        if not source_key or source_key.startswith(("http://", "https://", "color:")):
            return None
        proxy_key = proxy_key_for(source_key)
        poster_key = poster_key_for(source_key)
        if not self.object_exists(proxy_key) or not self.object_exists(poster_key):
            return None
        sprite_key = sprite_key_for(source_key)
        has_sprite = self.object_exists(sprite_key)
        return self._result_payload(proxy_key, poster_key, sprite_key if has_sprite else None)

    def derive_proxies(
        self,
        source_key: str,
        *,
        force: bool = False,
        make_sprite: bool = True,
        presigned_url: str | None = None,
    ) -> dict[str, str]:
        """Download source → FFmpeg proxy/poster/(sprite) → upload. Returns metadata keys + URLs.

        When a server-side presigned_url is provided the source is streamed directly into ffmpeg via HTTP
        (no full-file download into the API container), which cuts cold-start latency
        for large clips by 30–90 seconds.
        """
        if not source_key or source_key.startswith(("http://", "https://", "color:")):
            raise ValueError("sourceKey must be a durable S3 object key")
        if not ffmpeg_available():
            raise RuntimeError("ffmpeg/ffprobe not available on API host")

        proxy_key = proxy_key_for(source_key)
        poster_key = poster_key_for(source_key)
        sprite_key = sprite_key_for(source_key)

        need_proxy = force or not self.object_exists(proxy_key)
        need_poster = force or not self.object_exists(poster_key)
        need_sprite = make_sprite and (force or not self.object_exists(sprite_key))

        if not need_proxy and not need_poster and not need_sprite:
            return self._result_payload(proxy_key, poster_key, sprite_key if make_sprite else None)

        # Use presigned URL as ffmpeg input when available — avoids downloading the
        # entire source into the API container before encode can start.
        input_source: str | None = presigned_url

        with tempfile.TemporaryDirectory(prefix="hanuman-proxy-") as tmp:
            tmp_path = Path(tmp)

            if input_source is None:
                # Fallback: download to temp file (original behaviour).
                suffix = Path(source_key).suffix or ".mp4"
                if len(suffix) > 8:
                    suffix = ".mp4"
                src_path = tmp_path / f"source{suffix}"
                try:
                    src_path.write_bytes(self.storage.get_object_bytes(source_key))
                except Exception as exc:
                    raise FileNotFoundError(f"Source object not found: {source_key}") from exc
                input_source = str(src_path)

            if need_proxy:
                out_proxy = tmp_path / "proxy.mp4"
                self._run_ffmpeg(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        input_source,
                        "-vf",
                        "scale=-2:540",
                        "-c:v",
                        "libx264",
                        "-threads:v",
                        "1",
                        "-preset",
                        "veryfast",
                        "-crf",
                        "28",
                        "-pix_fmt",
                        "yuv420p",
                        "-an",
                        "-movflags",
                        "+faststart",
                        str(out_proxy),
                    ]
                )
                self.storage.upload_bytes(
                    proxy_key,
                    out_proxy.read_bytes(),
                    "video/mp4",
                    cache_control=CACHE_CONTROL_DERIVED_MEDIA,
                )
                logger.info("Uploaded proxy %s", proxy_key)

            if need_poster:
                out_poster = tmp_path / "poster.jpg"
                # Mid-ish frame: 1s in (or first frame if shorter).
                self._run_ffmpeg(
                    [
                        "ffmpeg",
                        "-y",
                        "-ss",
                        "1",
                        "-i",
                        input_source,
                        "-frames:v",
                        "1",
                        "-threads:v",
                        "1",
                        "-q:v",
                        "4",
                        "-pix_fmt",
                        "yuvj420p",
                        str(out_poster),
                    ],
                    allow_fail=True,
                )
                if not out_poster.is_file() or out_poster.stat().st_size == 0:
                    self._run_ffmpeg(
                        [
                            "ffmpeg",
                            "-y",
                            "-i",
                            input_source,
                            "-frames:v",
                            "1",
                            "-threads:v",
                            "1",
                            "-q:v",
                            "4",
                            "-pix_fmt",
                            "yuvj420p",
                            str(out_poster),
                        ]
                    )
                self.storage.upload_bytes(
                    poster_key,
                    out_poster.read_bytes(),
                    "image/jpeg",
                    cache_control=CACHE_CONTROL_DERIVED_MEDIA,
                )
                logger.info("Uploaded poster %s", poster_key)

            if need_sprite:
                out_sprite = tmp_path / "sprite.jpg"
                # ~10 tiles across at 160px wide — good enough for filmstrip repeat-x.
                self._run_ffmpeg(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        input_source,
                        "-vf",
                        "fps=1/3,scale=160:-1,tile=10x1",
                        "-frames:v",
                        "1",
                        "-threads:v",
                        "1",
                        "-q:v",
                        "5",
                        "-pix_fmt",
                        "yuvj420p",
                        str(out_sprite),
                    ],
                    allow_fail=True,
                )
                if out_sprite.is_file() and out_sprite.stat().st_size > 0:
                    self.storage.upload_bytes(
                        sprite_key,
                        out_sprite.read_bytes(),
                        "image/jpeg",
                        cache_control=CACHE_CONTROL_DERIVED_MEDIA,
                    )
                    logger.info("Uploaded sprite %s", sprite_key)
                else:
                    sprite_key = ""

        return self._result_payload(proxy_key, poster_key, sprite_key or None)

    def _result_payload(
        self,
        proxy_key: str,
        poster_key: str,
        sprite_key: str | None,
    ) -> dict[str, str]:
        out: dict[str, str] = {
            "proxyKey": proxy_key,
            "posterKey": poster_key,
            "proxyUrl": self.storage.public_download_url(proxy_key),
            "posterUrl": self.storage.public_download_url(poster_key),
        }
        if sprite_key:
            out["spriteKey"] = sprite_key
            out["spriteUrl"] = self.storage.public_download_url(sprite_key)
        return out

    @staticmethod
    def _run_ffmpeg(cmd: list[str], *, allow_fail: bool = False) -> None:
        # Several derives may run concurrently. Bound decoder/filter pools as
        # well as each output encoder, which otherwise scale to host CPU count.
        command = [cmd[0], "-nostdin", "-hide_banner", "-threads", "1",
                   "-filter_threads", "1", "-filter_complex_threads", "1", *cmd[1:]]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            msg = (result.stderr or result.stdout or "ffmpeg failed")[-800:]
            if allow_fail:
                logger.warning("ffmpeg soft-fail: %s", msg)
                return
            raise RuntimeError(f"ffmpeg failed: {msg}")
