"""Authenticated provider catalogs and reusable narration auditions."""
import asyncio
import hashlib
import base64

from botocore.exceptions import ClientError

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.config import settings
from app.db.models import User
from app.services.storage import get_storage_service

router = APIRouter(prefix="/channel-settings")
_preview_slots = asyncio.Semaphore(3)

SPEAKERS = frozenset("aditya ritu priya neha rahul pooja rohan simran kavya amit dev ishita shreya ratan varun manan sumit roopa kabir aayan shubh ashutosh advait anand tanya tarun sunny mani gokul vijay shruti suhani mohit kavitha rehan soham rupali".split())


@router.get("/image-models")
async def image_models(_: User = Depends(get_current_user)) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get("https://openrouter.ai/api/v1/images/models")
    if response.status_code != 200:
        raise HTTPException(502, "Could not load image models. Please try again.")
    key = settings.openrouter_image_api_key.strip() or (settings.openrouter_api_key.strip() if "openrouter.ai" in settings.openrouter_base_url else "")
    configured = False
    if key:
        async with httpx.AsyncClient(timeout=20) as client:
            check = await client.get("https://openrouter.ai/api/v1/key", headers={"Authorization": f"Bearer {key}"})
        configured = check.status_code == 200
    return {"imageConfigured": configured, "items": [{"id": m["id"], "name": m.get("name", m["id"])} for m in response.json().get("data", []) if "image" in m.get("architecture", {}).get("output_modalities", []) and "vector" not in m.get("id", "")]}


class VoiceSampleRequest(BaseModel):
    speaker: str = Field(max_length=40)


@router.post("/voice-sample")
async def voice_sample(body: VoiceSampleRequest, _: User = Depends(get_current_user)) -> dict:
    if body.speaker not in SPEAKERS:
        raise HTTPException(422, "Choose a supported narrator.")
    if not settings.sarvam_api_key.strip():
        raise HTTPException(503, "Voice previews need the configured Sarvam API key.")
    text = f"Hi, I am {body.speaker.capitalize()}, your SkyClip narrator. Every documentary begins with a question. Together, we explore the evidence and bring the story to life."
    key = hashlib.sha256(("bulbul:v3|en-IN|" + text).encode()).hexdigest()
    object_key = f"voice-samples/{key}.wav"
    storage = get_storage_service()
    async with _preview_slots:
        try:
            cached = await asyncio.to_thread(storage.get_object_bytes, object_key)
            return {"audioBase64": base64.b64encode(cached).decode(), "mime": "audio/wav", "speaker": body.speaker}
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {"NoSuchKey", "404", "NotFound"}:
                raise HTTPException(503, "Voice sample storage is unavailable.") from exc
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post("https://api.sarvam.ai/text-to-speech", headers={"api-subscription-key": settings.sarvam_api_key}, json={"text": text, "target_language_code": "en-IN", "speaker": body.speaker, "model": "bulbul:v3", "speech_sample_rate": 24000})
        if response.status_code != 200:
            raise HTTPException(502, f"Narrator preview unavailable (provider status {response.status_code}).")
        audios = response.json().get("audios") or []
        if not audios:
            raise HTTPException(502, "The voice provider returned no audio.")
        audio = audios[0]
        try:
            decoded = base64.b64decode(audio, validate=True)
        except (ValueError, TypeError) as exc:
            raise HTTPException(502, "The voice provider returned invalid audio.") from exc
        await asyncio.to_thread(storage.upload_bytes, object_key, decoded, "audio/wav")
    return {"audioBase64": audio, "mime": "audio/wav", "speaker": body.speaker}
import uuid
import json
from app.schemas.motion_templates import UploadedMotionTemplate
from app.services.render_service import RenderServiceClient

@router.post('/motion-templates')
async def save_motion_template(body: UploadedMotionTemplate, user: User = Depends(get_current_user)) -> dict:
    template=body.model_dump()
    run=str(uuid.uuid4())
    key=f'templates/{user.id}/{body.id}/{run}.mp4'
    manifest={'version':'1','metadata':{'project_id':str(user.id),'run_id':run,'format_mode':'documentary','duration_sec':body.durationSec,'fps':30,'resolution':{'width':1920,'height':1080}},'tracks':{'video':[{'id':'template-preview','scene_id':'sample','type':'image','src':'color:#000000','start_sec':0,'duration_sec':body.durationSec,'muted':True,'motion_template':{'id':'editorial-title','title':body.name,'html_template':template}}],'broll':[],'audio':[],'captions':[],'music':[]},'settings':{'captions_enabled':False,'sfx_volume':.5}}
    storage=get_storage_service()
    await asyncio.to_thread(storage.upload_bytes,f'templates/{user.id}/{body.id}/template.json',json.dumps(template).encode(),'application/json')
    job=await RenderServiceClient().start_render(manifest=manifest,output_key=key,project_id=str(user.id),run_id=run)
    return {'renderId':job.render_id,'previewKey':key,'template':template}

@router.get('/motion-templates/previews/{render_id}')
async def motion_template_preview(render_id: str, user: User = Depends(get_current_user)) -> dict:
    client=RenderServiceClient()
    job=await client.get_status(render_id)
    if job.project_id != str(user.id) or not job.output_key.startswith(f'templates/{user.id}/'):
        raise HTTPException(404,'Template preview not found.')
    url=None
    if job.status=='completed':
        url=get_storage_service().presigned_download_url(job.output_key)
    return {'status':job.status,'progress':job.progress,'message':job.message,'error':job.error,'url':url}

@router.get('/motion-templates/preview')
async def refresh_template_preview(key: str,user: User = Depends(get_current_user)) -> dict:
    if not key.startswith(f'templates/{user.id}/') or not key.endswith('.mp4'):
        raise HTTPException(404,'Template preview not found.')
    storage=get_storage_service()
    try:
        await asyncio.to_thread(storage.client.head_object, Bucket=storage.bucket, Key=key)
    except ClientError as exc:
        if exc.response.get('Error',{}).get('Code') in {'NoSuchKey','404','NotFound'}:
            raise HTTPException(409,'Template preview is still rendering.') from exc
        raise
    return {'url':storage.presigned_download_url(key)}

