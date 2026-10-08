"""Scene image generation through OpenRouter's dedicated Image API."""
import base64
import httpx
from src.config import settings


async def generate_scene_image(model: str, prompt: str) -> tuple[bytes, str]:
    key = settings.openrouter_image_api_key.strip() or (settings.openrouter_api_key.strip() if "openrouter.ai" in settings.openrouter_base_url else "")
    if not model or not key:
        raise RuntimeError("AI images require an image model and OPENROUTER_IMAGE_API_KEY (an OpenRouter key, independent of the text provider)")
    async with httpx.AsyncClient(timeout=240) as client:
        response = await client.post("https://openrouter.ai/api/v1/images", headers={"Authorization": f"Bearer {key}"}, json={"model": model, "prompt": prompt, "aspect_ratio": "16:9", "n": 1, "output_format": "png"})
    if response.status_code != 200:
        raise RuntimeError(f"Scene image generation failed (provider status {response.status_code})")
    images = response.json().get("data") or []
    if not images or not images[0].get("b64_json"):
        raise RuntimeError("Image model returned no scene image")
    mime = images[0].get("media_type", "image/png")
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise RuntimeError("Choose a raster image model for video scenes")
    return base64.b64decode(images[0]["b64_json"], validate=True), mime
