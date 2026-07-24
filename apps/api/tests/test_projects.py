import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await engine.dispose()


@pytest.mark.integration
async def test_create_and_list_project(client: AsyncClient):
    payload = {
        "title": "Test Documentary",
        "entryPath": "prompt_first",
        "formatMode": "documentary",
        "promptText": "A short documentary about coral reefs.",
        "targetDurationSec": 120,
        "language": "en",
    }
    create_res = await client.post("/projects", json=payload)
    if create_res.status_code == 500 and "Dev user" in create_res.text:
        pytest.skip("Database not migrated or dev user missing")
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    assert created["title"] == payload["title"]
    assert created["status"] == "draft"
    assert created["brief"]["promptText"] == payload["promptText"]

    list_res = await client.get("/projects")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert any(p["id"] == created["id"] for p in items)

    get_res = await client.get(f"/projects/{created['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == created["id"]


@pytest.mark.integration
async def test_create_script_first_project(client: AsyncClient):
    payload = {
        "title": "Top 10 Facts",
        "entryPath": "script_first",
        "formatMode": "listicle",
        "scriptText": "1. First fact\n2. Second fact",
    }
    res = await client.post("/projects", json=payload)
    if res.status_code == 500 and "Dev user" in res.text:
        pytest.skip("Database not migrated or dev user missing")
    assert res.status_code == 201, res.text
    assert res.json()["entryPath"] == "script_first"


@pytest.mark.integration
async def test_create_project_validation_error(client: AsyncClient):
    res = await client.post(
        "/projects",
        json={
            "title": "Missing prompt",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
        },
    )
    assert res.status_code == 422
