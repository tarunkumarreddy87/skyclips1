import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, get_project_service, get_quote_service, get_storage
from app.db.models import User
from app.schemas.project import (
    CreateProjectRequest,
    ProjectDetailResponse,
    ProjectListResponse,
    UpdateBriefRequest,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.schemas.quote import ApproveQuoteRequest, QuoteResponse, UpdateQuoteRequest
from app.services.project_service import ProjectService
from app.services.quote_service import QuoteService
from app.services.storage import StorageService

router = APIRouter(prefix="/projects")


@router.post("", response_model=ProjectDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: CreateProjectRequest,
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectDetailResponse:
    return await service.create_project(user, payload)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectListResponse:
    return await service.list_projects(user)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectDetailResponse:
    return await service.get_project(user, project_id)


@router.post("/{project_id}/upload-url", response_model=UploadUrlResponse)
async def create_upload_url(
    project_id: uuid.UUID,
    payload: UploadUrlRequest,
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
    storage: StorageService = Depends(get_storage),
) -> UploadUrlResponse:
    # Ownership check — media uploads are allowed for any status (editor after generate).
    await service.get_project(user, project_id)

    expires_in = 3600
    s3_key = storage.script_upload_key(project_id, payload.filename)
    upload_url = storage.presigned_upload_url(
        s3_key=s3_key,
        content_type=payload.content_type,
        expires_in=expires_in,
    )
    download_url = storage.public_download_url(s3_key, expires_in=expires_in)
    return UploadUrlResponse(
        upload_url=upload_url,
        s3_key=s3_key,
        expires_in_sec=expires_in,
        download_url=download_url,
    )


@router.patch("/{project_id}/brief", response_model=ProjectDetailResponse)
async def update_brief(
    project_id: uuid.UUID,
    payload: UpdateBriefRequest,
    user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectDetailResponse:
    return await service.update_brief(user, project_id, payload)


@router.post("/{project_id}/quote", response_model=QuoteResponse)
async def generate_quote(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    return await service.generate_quote(user, project_id)


@router.get("/{project_id}/quote", response_model=QuoteResponse)
async def get_active_quote(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    return await service.get_active_quote(user, project_id)


@router.patch("/{project_id}/quote", response_model=QuoteResponse)
async def update_quote(
    project_id: uuid.UUID,
    payload: UpdateQuoteRequest,
    user: User = Depends(get_current_user),
    service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    return await service.update_active_quote(user, project_id, payload)


@router.post("/{project_id}/approve", response_model=QuoteResponse)
async def approve_quote(
    project_id: uuid.UUID,
    payload: ApproveQuoteRequest | None = None,
    user: User = Depends(get_current_user),
    service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    return await service.approve_quote(
        user, project_id, expected_quote_id=payload.quote_id if payload else None
    )
