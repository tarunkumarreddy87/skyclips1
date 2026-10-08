import time
from threading import Event

import httpx
import pytest

from src.render.render_service_client import _request_with_retry, RenderFatalError, RenderCancelledError


def test_temporary_failure_reuses_request_identity(monkeypatch):
    monkeypatch.setattr("src.render.render_service_client.time.sleep", lambda _: None)
    seen = []
    def handle(request):
        seen.append(request.content)
        return httpx.Response(503 if len(seen) == 1 else 202, json={"renderId": "same-job"})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        response = _request_with_retry(client, "POST", "http://render/render/start",
            deadline=time.monotonic() + 60, json={"externalId": "project:run"})
    assert response.json()["renderId"] == "same-job"
    assert len(seen) == 2 and seen[0] == seen[1]


def test_validation_failure_does_not_retry():
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(422)
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(RenderFatalError):
            _request_with_retry(client, "GET", "http://render/status", deadline=time.monotonic() + 60)
    assert len(calls) == 1


def test_cancelled_activity_never_calls_remote():
    event = Event()
    event.set()
    with pytest.raises(RenderCancelledError):
        _request_with_retry(None, "GET", "http://render/status", deadline=time.monotonic() + 60,
                            cancel_event=event)


def test_deadline_does_not_start_more_work():
    with pytest.raises(RenderFatalError):
        _request_with_retry(None, "GET", "http://render/status", deadline=time.monotonic() - 1)


def test_native_cloud_resubmission_preserves_object_keys_and_identity(monkeypatch):
    import json
    from src.render import render_service_client as module
    manifest = {"metadata": {"duration_sec": 4}, "tracks": {
        "video": [{"src": "projects/p/uploaded.mp4"}], "audio": []}}
    monkeypatch.setattr(module, "get_bytes", lambda _: json.dumps(manifest).encode())
    submissions = []
    def handle(request):
        if request.method == "POST":
            submissions.append(json.loads(request.content))
            return httpx.Response(202, json={"renderId": f"job-{len(submissions)}"})
        if request.url.path.endswith("/job-1/status"):
            return httpx.Response(404)
        if request.url.path.endswith("/status"):
            return httpx.Response(200, json={"job": {"status": "completed", "progress": 100}})
        return httpx.Response(200, json={"job": {"durationSec": 4}})
    real_client = httpx.Client
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: real_client(
        transport=httpx.MockTransport(handle), **kwargs))
    output, duration = module.render_with_render_service(timeline_key="timeline", project_id="p", run_id="r")
    assert duration == 4 and output == "projects/p/runs/r/final.mp4"
    assert len(submissions) == 2 and submissions[0] == submissions[1]
    assert submissions[0]["manifest"] == manifest
    assert submissions[0]["externalId"] == "p:r"


def test_native_cloud_terminal_failure_fails_without_resubmission(monkeypatch):
    from src.render import render_service_client as module
    monkeypatch.setattr(module, "get_bytes", lambda _: b'{"metadata":{"duration_sec":4}}')
    posts = []
    def handle(request):
        if request.method == "POST":
            posts.append(request)
            return httpx.Response(202, json={"renderId": "job"})
        return httpx.Response(200, json={"job": {"status": "failed", "error": "Bad source"}})
    real_client = httpx.Client
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: real_client(
        transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(RenderFatalError, match="Bad source"):
        module.render_with_render_service(timeline_key="timeline", project_id="p", run_id="r")
    assert len(posts) == 1


def test_native_cloud_cancellation_stops_before_reading_source(monkeypatch):
    from src.render import render_service_client as module
    monkeypatch.setattr(module, "get_bytes", lambda _: pytest.fail("Cancelled render read source"))
    event = Event()
    event.set()
    with pytest.raises(RenderCancelledError):
        module.render_with_render_service(timeline_key="timeline", project_id="p", run_id="r", cancel_event=event)


def test_request_timeout_is_capped_by_remaining_deadline():
    def handle(request):
        assert 0 < request.extensions["timeout"]["read"] <= 2
        return httpx.Response(200)
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        _request_with_retry(client, "GET", "http://render/status", deadline=time.monotonic() + 2)
