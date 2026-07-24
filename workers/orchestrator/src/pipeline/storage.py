from __future__ import annotations

import json
from functools import lru_cache

import boto3
from botocore.client import Config

from src.config import settings


@lru_cache
def _s3_client():
    endpoint = (settings.s3_endpoint or "").strip() or None
    # Empty credentials → use default AWS chain (ECS task role / env / instance profile).
    access_key = (settings.s3_access_key or "").strip() or None
    secret_key = (settings.s3_secret_key or "").strip() or None
    if access_key in ("minioadmin",) and not endpoint:
        access_key = None
        secret_key = None
    kwargs: dict = {
        "region_name": settings.s3_region,
        "config": Config(signature_version="s3v4"),
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key
    return boto3.client("s3", **kwargs)


def artifact_key(project_id: str, run_id: str, name: str) -> str:
    return f"projects/{project_id}/runs/{run_id}/{name}"


def put_json(key: str, data: dict) -> None:
    body = json.dumps(data, indent=2).encode("utf-8")
    _s3_client().put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
    )


def put_bytes(key: str, data: bytes, content_type: str) -> int:
    _s3_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
    return len(data)


def get_bytes(key: str) -> bytes:
    response = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    return response["Body"].read()


def get_json(key: str) -> dict:
    return json.loads(get_bytes(key).decode("utf-8"))
