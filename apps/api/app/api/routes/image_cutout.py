"""Owned-image background removal. The original asset is never overwritten."""
import asyncio
import hashlib
import io
import threading
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.api.deps import get_current_user, get_project_service, get_storage, verify_internal_key
from app.db.models import User
from app.services.project_service import ProjectService
from app.services.storage import StorageService

router = APIRouter(prefix="/projects")
from app.api.routes.production_cutout import router as production_cutout_router
router.include_router(production_cutout_router)
_lock = threading.Lock()
_session = None

class CutoutRequest(BaseModel):
    sourceKey: str = Field(min_length=1, max_length=1024)

@router.post("/internal/{project_id}/remove-background", dependencies=[Depends(verify_internal_key)])
async def remove_background_internal(project_id: uuid.UUID, payload: CutoutRequest,
    storage: StorageService = Depends(get_storage)):
    result = await _remove_owned_image(project_id, payload, storage)
    return {**result, "transparent": True}

def cutout(data: bytes) -> bytes:
    from PIL import Image
    from rembg import new_session, remove
    global _session
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 25_000_000:
            raise ValueError("Image is too large; use an image below 25 megapixels")
        image.verify()
    with _lock:
        if _session is None:
            _session = new_session("u2netp")
        return remove(data, session=_session)

@router.post("/{project_id}/remove-background")
async def remove_background(project_id: uuid.UUID, payload: CutoutRequest,
    user: User = Depends(get_current_user), service: ProjectService = Depends(get_project_service),
    storage: StorageService = Depends(get_storage)):
    await service.get_project(user, project_id)
    return await _remove_owned_image(project_id, payload, storage)

async def _remove_owned_image(project_id: uuid.UUID, payload: CutoutRequest, storage: StorageService):
    if not payload.sourceKey.startswith(f"projects/{project_id}/"):
        raise HTTPException(403, "Image must belong to this project")
    try:
        metadata = await asyncio.to_thread(storage.client.head_object, Bucket=storage.bucket, Key=payload.sourceKey)
        if metadata.get("ContentLength", 0) > 20*1024*1024:
            raise HTTPException(413, "Use an image smaller than 20 MB")
        data = await asyncio.to_thread(storage.get_object_bytes, payload.sourceKey)
        key = f"projects/{project_id}/cutouts/{hashlib.sha256(data).hexdigest()}-u2netp.png"
        try:
            await asyncio.to_thread(storage.client.head_object, Bucket=storage.bucket, Key=key)
        except Exception:
            result = await asyncio.to_thread(cutout, data)
            await asyncio.to_thread(storage.upload_bytes, key, result, "image/png")
        return {"s3Key": key, "downloadUrl": storage.public_download_url(key)}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Background removal failed. Your original image is unchanged; please try again.") from exc
