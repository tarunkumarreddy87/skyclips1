import socket
from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlparse, urlunparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _local_dev_host(hostport: str, docker_hostname: str, fallback: str) -> str:
    """Use localhost when Docker-only hostnames are set but not resolvable on the host."""
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


_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = _REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://hanuman:hanuman@localhost:5432/hanuman"
    redis_url: str = "redis://localhost:6379/0"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "hanuman-artifacts"
    s3_region: str = "us-east-1"
    # Browser-facing S3 endpoint. When the app runs in Docker the internal
    # s3_endpoint is `http://minio:9000` (not resolvable by the browser). Presigned
    # URLs embed the host in the signature, so we must generate download URLs against
    # a host the browser can actually reach. Leave empty to use s3_endpoint as-is.
    s3_public_endpoint: str = ""
    # Optional CDN origin for media GETs (CloudFront / Cloudflare → S3).
    # When set, public_download_url returns `{MEDIA_CDN_BASE_URL}/{key}` instead of
    # a presigned S3 URL. Requires CDN → bucket auth (OAC/OAI) — see ADR 0012.
    media_cdn_base_url: str = ""

    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue_orchestrator: str = "orchestrator"
    temporal_task_queue_media: str = "media"

    hanuman_stub_mode: bool = True
    production_agent_enabled: bool = False
    dev_user_external_id: str = "dev-local-user"
    internal_api_key: str = "dev-internal"
    api_base_url: str = "http://localhost:8000"
    web_app_url: str = "http://localhost:3000"
    billing_enabled: bool = False

    # Supabase Auth only (no Supabase business DB). When set, Bearer JWT is required.
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""

    openrouter_api_key: str = ""
    openrouter_image_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    editor_agent_fast_model: str = ""
    editor_agent_smart_model: str = ""
    editor_agent_vision_model: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    pexels_api_key: str = ""
    serpapi_api_key: str = ""

    sarvam_api_key: str = ""
    sarvam_tts_speaker: str = "shubh"

    # Native cloud render service (ADR 0012)
    render_service_url: str = "http://localhost:8081"
    render_service_api_key: str = ""
    render_engine: str = "native"

    @model_validator(mode="after")
    def normalize_docker_service_hosts(self) -> Self:
        # `make up` / docker compose can leak TEMPORAL_HOST=temporal:7233 into the shell.
        self.temporal_host = _local_dev_host(self.temporal_host, "temporal", "localhost:7233")
        self.render_service_url = _local_dev_url(
            self.render_service_url, "render-service", "localhost"
        )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def openrouter_configured(self) -> bool:
        return bool(self.openrouter_api_key.strip())


settings = Settings()

