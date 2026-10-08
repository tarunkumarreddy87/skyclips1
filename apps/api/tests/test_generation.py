import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.db.session import engine
from app.main import app

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await engine.dispose()


async def _approved_project(client: AsyncClient) -> dict:
    res = await client.post(
        "/projects",
        json={
            "title": "Generation Test",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": "A documentary about urban gardening.",
            "targetDurationSec": 90,
        },
    )
    if res.status_code == 500 and "Dev user" in res.text:
        pytest.skip("Database not migrated or dev user missing")
    assert res.status_code == 201, res.text
    project = res.json()
    quote = await client.post(f"/projects/{project['id']}/quote")
    await client.post(
        f"/projects/{project['id']}/approve", json={"quoteId": quote.json()["id"]}
    )
    return project


@pytest.mark.integration
async def test_start_generation_requires_approval(client: AsyncClient):
    res = await client.post(
        "/projects",
        json={
            "title": "Draft only",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": "Test",
        },
    )
    if res.status_code == 500 and "Dev user" in res.text:
        pytest.skip("Database not migrated or dev user missing")
    project = res.json()
    gen = await client.post(f"/projects/{project['id']}/generate")
    assert gen.status_code == 409


@pytest.mark.integration
async def test_start_generation_temporal_unavailable(client: AsyncClient):
    project = await _approved_project(client)

    with patch(
        "app.services.generation_service.TemporalService.start_video_generation",
        new_callable=AsyncMock,
        side_effect=RuntimeError("connection refused"),
    ):
        gen = await client.post(f"/projects/{project['id']}/generate")

    assert gen.status_code == 503, gen.text
    assert "unavailable" in gen.json()["detail"].lower()

    detail = await client.get(f"/projects/{project['id']}")
    assert detail.json()["status"] == "approved"


@pytest.mark.integration
async def test_start_generation_mocked_temporal(client: AsyncClient):
    project = await _approved_project(client)

    with patch(
        "app.services.generation_service.TemporalService.start_video_generation",
        new_callable=AsyncMock,
        return_value="temporal-run-123",
    ):
        gen = await client.post(f"/projects/{project['id']}/generate")

    assert gen.status_code == 200, gen.text
    body = gen.json()
    assert body["run"]["status"] == "running"
    assert body["workflowId"].startswith("video-gen-")

    detail = await client.get(f"/projects/{project['id']}")
    assert detail.json()["status"] == "running"

    latest = await client.get(f"/projects/{project['id']}/runs/latest")
    assert latest.status_code == 200
    assert latest.json()["id"] == body["run"]["id"]


@pytest.mark.integration
async def test_internal_progress_requires_key(client: AsyncClient):
    project = await _approved_project(client)
    with patch(
        "app.services.generation_service.TemporalService.start_video_generation",
        new_callable=AsyncMock,
        return_value="temporal-run-456",
    ):
        gen = await client.post(f"/projects/{project['id']}/generate")
    run_id = gen.json()["run"]["id"]

    bad = await client.post(
        "/internal/progress-events",
        json={
            "runId": run_id,
            "projectId": project["id"],
            "stage": "validate_brief",
            "status": "started",
            "message": "test",
        },
        headers={"X-Internal-Key": "wrong"},
    )
    assert bad.status_code == 401

    ok = await client.post(
        "/internal/progress-events",
        json={
            "runId": run_id,
            "projectId": project["id"],
            "stage": "validate_brief",
            "status": "started",
            "message": "Getting ready",
            "percent": 5,
        },
        headers={"X-Internal-Key": "dev-internal"},
    )
    assert ok.status_code == 200
    assert ok.json()["stage"] == "validate_brief"
