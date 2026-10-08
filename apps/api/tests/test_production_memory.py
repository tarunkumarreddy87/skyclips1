import asyncio
import json
from botocore.exceptions import ClientError
import pytest
from app.services.production_memory import channel_memory_key, remember_preferences


class Storage:
    def __init__(self): self.objects = {}
    def get_object_bytes(self, key):
        if key not in self.objects: raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return self.objects[key]
    def upload_bytes(self, key, data, mime): self.objects[key] = data


def test_owner_and_channel_isolation_and_current_settings_win():
    storage = Storage()
    first = asyncio.run(remember_preferences(storage, "owner", "channel", {"language": "te"}))
    second = asyncio.run(remember_preferences(storage, "owner", "channel", {"language": "en"}))
    assert first["previous_preferences"] == {}
    assert second["current"]["preferences"] == {"language": "en"}
    assert second["previous_preferences"] == {"language": "te"}
    assert channel_memory_key("other-owner", "channel") != channel_memory_key("owner", "channel")
    assert channel_memory_key("owner", "other-channel") != channel_memory_key("owner", "channel")
    assert json.loads(next(iter(storage.objects.values())))["source"] == "explicit_user_settings"


def test_storage_failure_is_not_treated_as_missing_memory():
    storage = Storage()
    def unavailable(key): raise ClientError({"Error": {"Code": "AccessDenied"}}, "GetObject")
    storage.get_object_bytes = unavailable
    with pytest.raises(ClientError): asyncio.run(remember_preferences(storage, "owner", "channel", {}))
    assert not storage.objects
