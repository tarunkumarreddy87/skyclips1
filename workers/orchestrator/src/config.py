import socket

from pathlib import Path

from typing import Self

from urllib.parse import urlparse, urlunparse



from pydantic import model_validator

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

    temporal_task_queue_orchestrator: str = "orchestrator"

    temporal_task_queue_media: str = "media"

    # Prefer real LLM/TTS; stub is opt-in via HANUMAN_STUB_MODE=true.
    hanuman_stub_mode: bool = False



    api_base_url: str = "http://localhost:8000"

    internal_api_key: str = "dev-internal"



    s3_endpoint: str = "http://localhost:9000"

    s3_access_key: str = "minioadmin"

    s3_secret_key: str = "minioadmin"

    s3_bucket: str = "hanuman-artifacts"

    s3_region: str = "us-east-1"



    openrouter_api_key: str = ""

    openrouter_model: str = "deepseek/deepseek-v4-flash"

    openrouter_base_url: str = "https://openrouter.ai/api/v1"



    pexels_api_key: str = ""



    sarvam_api_key: str = ""

    sarvam_tts_model: str = "bulbul:v3"

    sarvam_tts_speaker: str = "shubh"

    sarvam_tts_language: str = "en-IN"

    sarvam_tts_output_codec: str = "wav"

    sarvam_tts_sample_rate: int = 22050

    sarvam_tts_pace: float = 1.0

    sarvam_tts_temperature: float = 0.6

    # Dev/test only: allow silent WAV when Sarvam fails. Never enable for real users.
    allow_silent_tts_fallback: bool = False

    @model_validator(mode="after")

    def normalize_docker_service_hosts(self) -> Self:

        # docker compose / shell can leak in-network hostnames when workers run on the host.

        self.temporal_host = _local_dev_host(self.temporal_host, "temporal", "localhost:7233")

        self.api_base_url = _local_dev_url(self.api_base_url, "api", "localhost")

        self.s3_endpoint = _local_dev_url(self.s3_endpoint, "minio", "localhost")

        return self



    @property

    def openrouter_configured(self) -> bool:

        return bool(self.openrouter_api_key.strip())



    @property

    def pexels_configured(self) -> bool:

        return bool(self.pexels_api_key.strip())



    @property

    def sarvam_configured(self) -> bool:

        return bool(self.sarvam_api_key.strip())





settings = Settings()


