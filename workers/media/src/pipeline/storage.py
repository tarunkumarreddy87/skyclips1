from __future__ import annotations

import json
from functools import lru_cache

import boto3
from botocore.client import Config

from src.config import settings

# Long TTL for Lambda renders that may retry or run 60+ minutes.
PRESIGN_DOWNLOAD_EXPIRES_SEC = 86_400


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
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key
    return boto3.client("s3", **kwargs)


@lru_cache
def _s3_client():
    endpoint = (settings.s3_endpoint or "").strip() or None
    return _make_client(endpoint)


@lru_cache
def _s3_public_client():
    endpoint = (settings.s3_public_endpoint or settings.s3_endpoint or "").strip() or None
    return _make_client(endpoint)


def get_bytes(key: str) -> bytes:
    response = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    return response["Body"].read()


def put_bytes(key: str, data: bytes, content_type: str) -> int:
    _s3_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
    return len(data)


def presigned_download_url(key: str, expires_in: int = PRESIGN_DOWNLOAD_EXPIRES_SEC) -> str:
    """Presigned GET for Remotion/Lambda — must use a host reachable from AWS."""
    return _s3_public_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
