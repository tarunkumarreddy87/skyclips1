"""Provider previews must reuse durable samples and reject unknown speakers."""
import base64
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from botocore.exceptions import ClientError
from app.api.routes import channel_settings as route

class ChannelSettingsTests(unittest.IsolatedAsyncioTestCase):
    async def test_durable_preview_cache_avoids_provider_call(self):
        storage = MagicMock()
        storage.get_object_bytes.return_value = b"RIFFcached-wave"
        with patch.object(route.settings, "sarvam_api_key", "test"), patch.object(route, "get_storage_service", return_value=storage), patch.object(route.httpx, "AsyncClient") as client:
            result = await route.voice_sample(route.VoiceSampleRequest(speaker="shubh"), None)
        self.assertEqual(base64.b64decode(result["audioBase64"]), b"RIFFcached-wave")
        client.assert_not_called()

    async def test_missing_sample_is_generated_and_saved(self):
        storage = MagicMock()
        storage.get_object_bytes.side_effect = ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        client = AsyncMock()
        response = MagicMock(status_code=200)
        response.json.return_value = {"audios": [base64.b64encode(b"RIFFnew-wave").decode()]}
        client.post.return_value = response
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=client)
        context.__aexit__ = AsyncMock(return_value=False)
        with patch.object(route.settings, "sarvam_api_key", "test"), patch.object(route, "get_storage_service", return_value=storage), patch.object(route.httpx, "AsyncClient", return_value=context):
            result = await route.voice_sample(route.VoiceSampleRequest(speaker="shubh"), None)
        self.assertEqual(base64.b64decode(result["audioBase64"]), b"RIFFnew-wave")
        self.assertEqual(storage.upload_bytes.call_args.args[1:], (b"RIFFnew-wave", "audio/wav"))
        self.assertEqual(client.post.call_args.kwargs["json"]["speaker"], "shubh")

    async def test_unknown_voice_rejected_before_provider(self):
        with self.assertRaises(HTTPException) as error:
            await route.voice_sample(route.VoiceSampleRequest(speaker="unknown"), None)
        self.assertEqual(error.exception.status_code, 422)

if __name__ == "__main__":
    unittest.main()
