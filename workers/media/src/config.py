import socket
from pathlib import Path
from typing import Self
from urllib.parse import urlparse, urlunparse

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]


def _optional_env_file() -> str | None:
    """Load monorepo .env when running on the host. Skip in Docker (/app has no repo .env)."""
    candidate = _REPO_ROOT / ".env"
    return str(candidate) if candidate.is_file() else None


def _local_dev_host(hostport: str, docker_hostname: str, fallback: str) -> str:
    host = hostport.split(":", 1)[0]
    if host != docker_hostname:
        return hostport
    try:
        socket.getaddrinfo(host, None)
        return hostport
    except socket.gaierror:
        return fallback


def _local_dev_url(url: str, docker_hostname: str, fallback_host: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname != docker_hostname:
        return url
    try:
        socket.getaddrinfo(docker_hostname, None)
        return url
    except socket.gaierror:
        port = f":{parsed.port}" if parsed.port else ""
        netloc = f"{fallback_host}{port}"
        return urlunparse(parsed._replace(netloc=netloc))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_optional_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue_media: str = "media"
    media_max_concurrent_activities: int = Field(default=1, ge=1, le=16)
    hanuman_stub_mode: bool = True

    api_base_url: str = "http://localhost:8000"
    internal_api_key: str = "dev-internal"

    s3_endpoint: str = "http://localhost:9000"
    s3_public_endpoint: str = ""
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "hanuman-artifacts"
    s3_region: str = "us-east-1"

    # Shared graphics runtime + native media pipeline, locally or on cloud workers.
    render_engine: str = "native"
    render_ffmpeg_fallback: bool = False
    render_encoder: str = "auto"
    render_parallel_sections: int = 2
    render_ffmpeg_threads: int = 2
    render_cache_dir: str = ""
    render_cache_max_bytes: int = Field(default=5 * 1024**3, ge=1)
    render_cache_ttl_sec: int = Field(default=7 * 24 * 3600, ge=1)
    render_graphics_command: str = ""
    render_service_url: str = "http://localhost:8081"
    render_service_api_key: str = ""
    render_service_poll_interval_sec: float = 1.0
    render_service_timeout_sec: int = 7200

    @model_validator(mode="after")
    def normalize_docker_service_hosts(self) -> Self:
        self.temporal_host = _local_dev_host(self.temporal_host, "temporal", "localhost:7233")
        self.api_base_url = _local_dev_url(self.api_base_url, "api", "localhost")
        self.s3_endpoint = _local_dev_url(self.s3_endpoint, "minio", "localhost")
        if self.s3_public_endpoint:
            self.s3_public_endpoint = _local_dev_url(self.s3_public_endpoint, "minio", "localhost")
        self.render_service_url = _local_dev_url(
            self.render_service_url, "render-service", "localhost"
        )
        engine = (self.render_engine or "ffmpeg").strip().lower()
        if engine not in ("native", "native-local", "native-cloud", "ffmpeg", "auto"):
            raise ValueError(
                "RENDER_ENGINE must be native|native-local|native-cloud|ffmpeg|auto, "
                f"got {self.render_engine!r}"
            )
        self.render_engine = engine
        return self


settings = Settings()
