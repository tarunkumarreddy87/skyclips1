import uuid
from functools import lru_cache

import boto3
from botocore.client import Config

from app.config import settings


def _make_client(endpoint_url: str | None):
    access_key = (settings.s3_access_key or "").strip() or None
    secret_key = (settings.s3_secret_key or "").strip() or None
    if access_key == "minioadmin" and not endpoint_url:
        access_key = None
        secret_key = None
    kwargs: dict = {
        "region_name": settings.s3_region,
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"} if endpoint_url else {},
        ),
    }
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    return boto3.client("s3", **kwargs)


@lru_cache
def _s3_client():
    endpoint = (settings.s3_endpoint or "").strip() or None
    return _make_client(endpoint)


@lru_cache
def _s3_public_client():
    endpoint = (settings.s3_public_endpoint or settings.s3_endpoint or "").strip() or None
    return _make_client(endpoint)


class StorageService:
    def __init__(self) -> None:
        self.bucket = settings.s3_bucket
        self.client = _s3_client()
        # Mint download URLs against the public endpoint so browsers can fetch them
        # even when the app runs in Docker (internal host `minio` is unreachable).
        self.public_client = _s3_public_client()

    def presigned_upload_url(
        self,
        *,
        s3_key: str,
        content_type: str,
        expires_in: int = 3600,
    ) -> str:
        return self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

    def script_upload_key(self, project_id: uuid.UUID, filename: str) -> str:
        safe_name = filename.replace("\\", "/").split("/")[-1]
        return f"projects/{project_id}/uploads/{uuid.uuid4()}-{safe_name}"

    def presigned_download_url(self, s3_key: str, expires_in: int = 3600) -> str:
        return self.public_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": s3_key},
            ExpiresIn=expires_in,
        )

    def upload_bytes(self, s3_key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=s3_key, Body=data, ContentType=content_type)

    def get_object_bytes(self, s3_key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=s3_key)
        return response["Body"].read()


def get_storage_service() -> StorageService:
    return StorageService()
