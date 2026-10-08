import asyncio
import io
import wave

import pytest
from botocore.exceptions import ClientError

from src.activities.pipeline import _await_with_heartbeats, _wav_duration_sec, _wav_has_speech_energy
from src.pipeline.concurrency import bounded_map
from src.pipeline import checkpoints


def test_slots_refill_without_waiting_for_slow_batch_and_preserve_order():
    async def run():
        slow = asyncio.Event()
        third_started = asyncio.Event()
        active = peak = 0

        async def job(i):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            try:
                if i == 0:
                    await slow.wait()
                elif i == 2:
                    third_started.set()
                return i * 2
            finally:
                active -= 1

        task = asyncio.create_task(bounded_map([0, 1, 2, 3], job, 2))
        await asyncio.wait_for(third_started.wait(), 1)
        assert not task.done()  # Third job starts while the first is still waiting.
        slow.set()
        assert await task == [0, 2, 4, 6]
        assert peak <= 2
    asyncio.run(run())


def test_failure_cancels_provider_calls_before_returning():
    async def run():
        cancelled = asyncio.Event()
        started = asyncio.Event()
        async def job(i):
            if i == 0:
                started.set()
                try:
                    await asyncio.Event().wait()
                finally:
                    cancelled.set()
            await started.wait()
            raise ValueError("provider down")
        with pytest.raises(ValueError, match="provider down"):
            await bounded_map([0, 1, 2], job, 2)
        assert cancelled.is_set()
    asyncio.run(run())


def test_temporal_cancellation_cleans_up_heartbeat_await():
    async def run():
        started, cancelled = asyncio.Event(), asyncio.Event()
        async def provider():
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        task = asyncio.create_task(_await_with_heartbeats(provider()))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cancelled.is_set()
    asyncio.run(run())


def test_tts_retry_reuses_valid_checkpoint_and_input_changes_invalidate(monkeypatch):
    storage = {}
    calls = 0
    def read(key):
        if key not in storage:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return storage[key]
    monkeypatch.setattr(checkpoints, "get_bytes", read)
    monkeypatch.setattr(checkpoints, "put_bytes", lambda k, v, ct: storage.__setitem__(k, v))
    async def provider():
        nonlocal calls
        calls += 1
        return b"valid audio"
    async def run():
        ctx = {"project_id": "p", "run_id": "r"}
        key = checkpoints.checkpoint_key(ctx, "tts", {"text": "Hello", "speaker": "a"})
        other = checkpoints.checkpoint_key(ctx, "tts", {"text": "Hello", "speaker": "b"})
        private = checkpoints.checkpoint_key({**ctx, "run_id": "different"}, "tts", {"text": "Hello", "speaker": "a"})
        assert key != other and key != private
        for _ in range(2):
            assert await checkpoints.checkpointed_bytes(key, provider, content_type="audio/wav",
                validate=lambda b: b == b"valid audio") == b"valid audio"
        assert calls == 1
    asyncio.run(run())


def test_storage_outage_does_not_trigger_repeat_provider_spend(monkeypatch):
    def denied(key):
        raise ClientError({"Error": {"Code": "AccessDenied"}}, "GetObject")
    monkeypatch.setattr(checkpoints, "get_bytes", denied)
    with pytest.raises(ClientError):
        asyncio.run(checkpoints.read_checkpoint("checkpoint"))


def test_stereo_duration_is_not_doubled():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        wf.writeframes(b"\0" * 22050 * 4)
    assert _wav_duration_sec(buf.getvalue()) == 1.0


def test_large_invalid_tts_response_is_not_speech():
    assert not _wav_has_speech_energy(b"error response" * 20000)
