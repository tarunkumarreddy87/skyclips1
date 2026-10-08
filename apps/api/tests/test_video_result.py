"""Run-scoped downloads must not substitute a previous successful export."""
import sqlite3
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import sqlite

from app.api.deps import get_current_user, get_generation_service
from app.api.routes.generation import router
from app.db.models import ArtifactType
from app.services.generation_service import GenerationService


def make_service():
    project_id, old_run, current_run = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    storage = Mock()
    storage.public_download_url.side_effect = lambda key: "https://media.example.invalid/" + key
    session = Mock()
    service = GenerationService(session, storage)
    service._get_project = AsyncMock(return_value=SimpleNamespace(id=project_id))
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE artifacts (id TEXT, project_id TEXT, run_id TEXT, type TEXT, created_at INTEGER)")
    artifacts = {}

    def add(run_id, order, *, artifact_project=None):
        owner = artifact_project or project_id
        artifact = SimpleNamespace(id=uuid.uuid4(), project_id=owner, run_id=run_id,
            type=ArtifactType.FINAL_VIDEO, s3_key=f"projects/{owner}/runs/{run_id}/final.mp4",
            content_type="video/mp4", metadata_={"duration_sec": 10})
        artifacts[artifact.id.hex] = artifact
        connection.execute("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?)",
            (artifact.id.hex, owner.hex, run_id.hex, "FINAL_VIDEO", order))
        return artifact

    async def execute(statement):
        # Execute the actual service predicates/order against isolated synthetic rows.
        query = statement.with_only_columns(statement.selected_columns.id)
        sql = str(query.compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds": True}))
        row = connection.execute(sql).fetchone()
        return SimpleNamespace(scalar_one_or_none=lambda: artifacts[row[0]] if row else None)

    session.execute = AsyncMock(side_effect=execute)
    return service, project_id, old_run, current_run, add, connection


@pytest.mark.asyncio
async def test_missing_current_output_does_not_fall_back_to_previous_export():
    service, project, old, current, add, db = make_service()
    try:
        add(old, 1)
        with pytest.raises(HTTPException) as error:
            await service.get_final_video(Mock(), project, run_id=current)
        assert error.value.status_code == 404
        service.storage.public_download_url.assert_not_called()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_run_scope_and_project_scope_select_the_correct_artifact():
    service, project, old, current, add, db = make_service()
    try:
        expected = add(current, 1)
        add(old, 2)
        add(current, 3, artifact_project=uuid.uuid4())
        result = await service.get_final_video(Mock(), project, run_id=current)
        assert result.id == str(expected.id)
        assert result.run_id == str(current)
        assert service.storage.public_download_url.call_count == 1
        unscoped = await service.get_final_video(Mock(), project)
        assert unscoped.run_id == str(old)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_owned_project_check_precedes_download_lookup():
    service, project, _, current, _, db = make_service()
    try:
        service._get_project.side_effect = HTTPException(404, "Project not found")
        with pytest.raises(HTTPException):
            await service.get_final_video(Mock(), project, run_id=current)
        service.session.execute.assert_not_called()
        service.storage.public_download_url.assert_not_called()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_download_route_forwards_run_id_and_rejects_invalid_uuid():
    service, project, old, current, add, db = make_service()
    try:
        add(old, 1)
        expected = add(current, 2)
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_current_user] = lambda: Mock()
        app.dependency_overrides[get_generation_service] = lambda: service
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/projects/{project}/video", params={"runId": str(current)})
            assert response.status_code == 200
            assert response.json()["id"] == str(expected.id)
            assert response.json()["runId"] == str(current)
            missing = await client.get(f"/projects/{project}/video", params={"runId": str(uuid.uuid4())})
            assert missing.status_code == 404
            invalid = await client.get(f"/projects/{project}/video", params={"runId": "invalid"})
            assert invalid.status_code == 422
    finally:
        db.close()
