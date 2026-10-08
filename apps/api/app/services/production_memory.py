"""Owner-scoped channel preferences; generated claims never become user memory."""
import asyncio
import hashlib
import json
from datetime import UTC, datetime
from botocore.exceptions import ClientError


def channel_memory_key(owner_id: str, profile_id: str) -> str:
    owner = hashlib.sha256(owner_id.encode()).hexdigest()
    profile = hashlib.sha256(profile_id.encode()).hexdigest()
    return f"agent-memory/{owner}/channels/{profile}/preferences.json"


async def remember_preferences(storage, owner_id: str, profile_id: str, preferences: dict) -> dict:
    key = channel_memory_key(owner_id, profile_id)
    previous = None
    try:
        previous = json.loads(await asyncio.to_thread(storage.get_object_bytes, key))
    except ClientError as exc:
        if str(exc.response.get("Error", {}).get("Code")) not in {"NoSuchKey", "404", "NotFound"}:
            raise
    record = {"version": 1, "source": "explicit_user_settings", "updated_at": datetime.now(UTC).isoformat(), "preferences": preferences}
    await asyncio.to_thread(storage.upload_bytes, key, json.dumps(record).encode(), "application/json")
    # Existing preferences are contextual history; the current request always wins.
    return {"current": record, "previous_preferences": previous.get("preferences", {}) if isinstance(previous, dict) else {}}
