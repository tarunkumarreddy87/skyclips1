"""Retry export must never receive the editor-loading placeholder."""
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.editor_snapshot_service import EditorSnapshotService


async def test_editor_fast_path_returns_actual_saved_manifest():
    project_id = uuid.uuid4()
    manifest = {"version": "1", "metadata": {"project_id": str(project_id)}, "tracks": {"video": []}}
    session = MagicMock()
    session.commit = AsyncMock()
    storage = MagicMock()
    storage.get_object_bytes.return_value = json.dumps(manifest).encode()
    service = EditorSnapshotService(session, storage)
    service._get_project = AsyncMock(return_value=SimpleNamespace(id=project_id))
    service._earliest_timeline_artifact = AsyncMock(return_value=object())
    service._ensure_original_snapshot = AsyncMock()
    snapshot = SimpleNamespace(id=uuid.uuid4(), editor_s3_key="editor.json", timeline_s3_key="timeline.json")
    service._latest_snapshot = AsyncMock(return_value=snapshot)
    service._load_editor_document = MagicMock(return_value={"project": {"id": str(project_id)}})
    service._media_urls_from_editor_document = MagicMock(return_value={})
    result = await service.get_editor_timeline(MagicMock(), project_id)
    assert result.manifest == manifest
    storage.get_object_bytes.assert_called_once_with("timeline.json")
