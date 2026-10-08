"""Trusted production workers may cut out only scoped project still assets."""
import asyncio
import hashlib
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.api.deps import get_storage, verify_internal_key
from app.services.storage import StorageService

router = APIRouter(prefix="/internal", dependencies=[Depends(verify_internal_key)])

class ProductionCutoutRequest(BaseModel):
    sourceKey: str = Field(min_length=1, max_length=1024)

@router.post("/{project_id}/remove-background")
async def production_remove_background(project_id: uuid.UUID, payload: ProductionCutoutRequest,
                                       storage: StorageService = Depends(get_storage)):
    from app.api.routes.image_cutout import cutout
    source = payload.sourceKey
    if not source.startswith(f"projects/{project_id}/") or not source.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(403, "Background removal requires a still owned by this project")
    try:
        metadata = await asyncio.to_thread(storage.client.head_object, Bucket=storage.bucket, Key=source)
        if metadata.get("ContentLength", 0) > 20 * 1024 * 1024:
            raise HTTPException(413, "Still exceeds 20 MB")
        data = await asyncio.to_thread(storage.get_object_bytes, source)
        key = f"projects/{project_id}/cutouts/{hashlib.sha256(data).hexdigest()}-u2netp.png"
        try:
            await asyncio.to_thread(storage.client.head_object, Bucket=storage.bucket, Key=key)
        except Exception:
            result = await asyncio.to_thread(cutout, data)
            # A successful provider call alone is not proof of transparent output.
            import io
            from PIL import Image
            with Image.open(io.BytesIO(result)) as image:
                if "A" not in image.getbands() or image.getchannel("A").getextrema()[0] == 255:
                    raise ValueError("No transparent subject was extracted")
            await asyncio.to_thread(storage.upload_bytes, key, result, "image/png")
        return {"s3Key": key, "originalKey": source, "transparent": True}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Background removal unavailable; original preserved") from exc
