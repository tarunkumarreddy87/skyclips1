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


@pytest.mark.integration
async def test_script_first_quote_and_generate_mocked_temporal(client: AsyncClient):
    create = await client.post(
        "/projects",
        json={
            "title": "Script-first MVP Path",
            "entryPath": "script_first",
            "formatMode": "documentary",
            "scriptText": "Intro.\n\nBody.\n\nOutro.",
            "targetDurationSec": 60,
            "language": "en",
        },
    )
    if create.status_code == 500 and "Dev user" in create.text:
        pytest.skip("Database not migrated or dev user missing")
    assert create.status_code == 201, create.text
    project = create.json()

    quote = await client.post(f"/projects/{project['id']}/quote")
    assert quote.status_code == 200
    await client.post(f"/projects/{project['id']}/approve")

    with patch(
        "app.services.generation_service.TemporalService.start_video_generation",
        new_callable=AsyncMock,
        return_value="temporal-run-999",
    ):
        gen = await client.post(f"/projects/{project['id']}/generate")

    assert gen.status_code == 200, gen.text
    assert gen.json()["run"]["status"] == "running"


@pytest.mark.integration
async def test_listicle_quote_gate(client: AsyncClient):
    create = await client.post(
        "/projects",
        json={
            "title": "Listicle Path",
            "entryPath": "prompt_first",
            "formatMode": "listicle",
            "promptText": "Top 5 facts about honeybees.",
            "targetDurationSec": 60,
            "language": "en",
        },
    )
    if create.status_code == 500 and "Dev user" in create.text:
        pytest.skip("Database not migrated or dev user missing")
    assert create.status_code == 201, create.text
    project = create.json()

    quote = await client.post(f"/projects/{project['id']}/quote")
    assert quote.status_code == 200, quote.text
    assert quote.json()["formatMode"] == "listicle"

    approve = await client.post(f"/projects/{project['id']}/approve")
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"

