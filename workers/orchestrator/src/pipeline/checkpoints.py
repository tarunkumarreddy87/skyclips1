"""Run-scoped content-addressed checkpoints; never share private narration across runs."""

import asyncio
import hashlib
import json
from collections.abc import Awaitable, Callable

from botocore.exceptions import ClientError

from src.pipeline.storage import artifact_key, get_bytes, put_bytes


def checkpoint_key(ctx: dict, kind: str, inputs: dict) -> str:
    fingerprint = hashlib.sha256(json.dumps(inputs, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return artifact_key(ctx["project_id"], ctx["run_id"], f"checkpoints/{kind}/{fingerprint}")


async def read_checkpoint(key: str) -> bytes | None:
    try:
        return await asyncio.to_thread(get_bytes, key)
    except ClientError as exc:
        if str(exc.response.get("Error", {}).get("Code")) in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise  # Storage outages are not cache misses.


async def checkpointed_bytes(
    key: str, generate: Callable[[], Awaitable[bytes]], *, content_type: str,
    validate: Callable[[bytes], bool],
) -> bytes:
    cached = await read_checkpoint(key)
    if cached is not None and await asyncio.to_thread(validate, cached):
        return cached
    result = await generate()
    if not await asyncio.to_thread(validate, result):
        raise ValueError("Provider returned empty or invalid media; checkpoint not saved")
    await asyncio.to_thread(put_bytes, key, result, content_type)
    return result
