"""Select the same native engine locally or through the cloud job service."""

from typing import Any


def resolve_render_engine(
    configured: str,
    manifest: dict[str, Any],
    *,
    render_service_configured: bool = True,
) -> tuple[str, str]:
    del manifest
    engine = (configured or "native").strip().lower()
    if engine in {"ffmpeg", "native-local"}:
        return "native-local", "explicit_local"
    if engine == "native-cloud" and not render_service_configured:
        raise ValueError("native-cloud requires RENDER_SERVICE_URL")
    if engine not in {"native", "native-cloud", "auto"}:
        raise ValueError(f"Unknown render engine: {configured}")
    return ("native-cloud", "render_service") if render_service_configured else (
        "native-local", "local_worker"
    )
