import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await engine.dispose()


async def _create_project(client: AsyncClient) -> dict:
    res = await client.post(
        "/projects",
        json={
            "title": "Quote Test Project",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": "The history of coral reefs and climate change.",
            "targetDurationSec": 180,
        },
    )
    if res.status_code == 500 and "Dev user" in res.text:
        pytest.skip("Database not migrated or dev user missing")
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.integration
async def test_quote_generate_update_approve(client: AsyncClient):
    project = await _create_project(client)
    assert project["status"] == "draft"

    quote_res = await client.post(f"/projects/{project['id']}/quote")
    assert quote_res.status_code == 200, quote_res.text
    quote = quote_res.json()
    assert quote["status"] == "pending_approval"
    assert quote["durationSec"] == 180
    assert len(quote["sectionOutline"]) >= 3

    detail = await client.get(f"/projects/{project['id']}")
    assert detail.json()["status"] == "quoted"
    assert detail.json()["activeQuote"]["id"] == quote["id"]

    patch_res = await client.patch(
        f"/projects/{project['id']}/quote",
        json={"durationSec": 240, "voiceId": "anushka"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["durationSec"] == 240
    assert patch_res.json()["voiceId"] == "anushka"

    approve_res = await client.post(
        f"/projects/{project['id']}/approve",
        json={"quoteId": patch_res.json()["id"]},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"

    final = await client.get(f"/projects/{project['id']}")
    assert final.json()["status"] == "approved"


@pytest.mark.integration
async def test_cannot_approve_without_quote(client: AsyncClient):
    project = await _create_project(client)
    res = await client.post(f"/projects/{project['id']}/approve")
    assert res.status_code == 409


@pytest.mark.integration
async def test_cannot_quote_when_approved(client: AsyncClient):
    project = await _create_project(client)
    quote = await client.post(f"/projects/{project['id']}/quote")
    await client.post(
        f"/projects/{project['id']}/approve", json={"quoteId": quote.json()["id"]}
    )

    res = await client.post(f"/projects/{project['id']}/quote")
    assert res.status_code == 409
