import json
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.schemas.generation import SaveTimelineRequest
from app.services.editor_snapshot_service import EditorSnapshotService


def test_bundled_sound_sources_are_not_presigned_as_s3_keys():
    storage = MagicMock()
    service = EditorSnapshotService(MagicMock(), storage)
    src = "static:sfx/motion-whoosh.wav"
    assert service._media_urls_from_manifest({"tracks": {"music": [{"src": src}]}})[src] == "/sfx/motion-whoosh.wav"
    assert service._media_urls_from_editor_document({"assets": [{"metadata": {"sourceKey": src}}]})[src] == "/sfx/motion-whoosh.wav"
    storage.public_download_url.assert_not_called()


async def test_invalid_save_does_not_touch_snapshots_or_storage():
    project_id = uuid.uuid4()
    storage = MagicMock()
    service = EditorSnapshotService(MagicMock(), storage)
    service._get_project = AsyncMock(return_value=SimpleNamespace(id=project_id))
    service._ensure_original_snapshot = AsyncMock()
    payload = SaveTimelineRequest(timelineManifest={"version": "1"}, editorDocument={})
    with pytest.raises(HTTPException) as error:
        await service.save_timeline(MagicMock(), project_id, payload)
    assert error.value.status_code == 422
    service._ensure_original_snapshot.assert_not_awaited()
    storage.upload_bytes.assert_not_called()


def valid_payload(project_id):
    fixture = Path(__file__).resolve().parents[3] / "packages/timeline-schema/fixtures/documentary-minimal.json"
    manifest = json.loads(fixture.read_text(encoding="utf-8"))
    manifest["metadata"]["project_id"] = str(project_id)
    # Saved media must live under this project's prefix (foreign keys are rejected).
    for clips in manifest["tracks"].values():
        for clip in clips if isinstance(clips, list) else []:
            if isinstance(clip.get("src"), str):
                clip["src"] = clip["src"].replace("projects/a1b2/", f"projects/{project_id}/", 1)
    return SaveTimelineRequest(
        timelineManifest=manifest,
        editorDocument={"project": {"id": str(project_id)}, "timeline": {}, "assets": []},
    )


@pytest.mark.parametrize("invalid", ["manifest_project", "document_project", "document_shape", "nonfinite"])
async def test_invalid_document_preserves_current_project(invalid):
    project_id = uuid.uuid4()
    payload = valid_payload(project_id)
    if invalid == "manifest_project":
        payload.timeline_manifest["metadata"]["project_id"] = str(uuid.uuid4())
    elif invalid == "document_project":
        payload.editor_document["project"]["id"] = str(uuid.uuid4())
    elif invalid == "document_shape":
        payload.editor_document["project"] = []
    else:
        payload.editor_document["timeline"]["duration"] = float("nan")
    storage = MagicMock()
    service = EditorSnapshotService(MagicMock(), storage)
    service._get_project = AsyncMock(return_value=SimpleNamespace(id=project_id))
    service._ensure_original_snapshot = AsyncMock()
    service._upsert_current_timeline_artifact = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await service.save_timeline(MagicMock(), project_id, payload)
    assert error.value.status_code == 422
    service._ensure_original_snapshot.assert_not_awaited()
    service._upsert_current_timeline_artifact.assert_not_awaited()
    storage.upload_bytes.assert_not_called()


async def test_valid_save_keeps_document_and_render_manifest_together():
    project_id = uuid.uuid4()
    payload = valid_payload(project_id)
    session = MagicMock()
    for method in ("flush", "commit", "refresh"):
        setattr(session, method, AsyncMock())
    storage = MagicMock()
    service = EditorSnapshotService(session, storage)
    service._get_project = AsyncMock(return_value=SimpleNamespace(id=project_id))
    service._ensure_original_snapshot = AsyncMock()
    service._upsert_current_timeline_artifact = AsyncMock()
    service._prune_snapshots = AsyncMock()
    service._list_snapshot_metas = AsyncMock(return_value=[])
    result = await service.save_timeline(MagicMock(), project_id, payload)
    assert storage.upload_bytes.call_count == 2
    uploads = storage.upload_bytes.call_args_list
    assert json.loads(uploads[0].args[1]) == payload.editor_document
    assert json.loads(uploads[1].args[1]) == payload.timeline_manifest
    assert str(result.snapshot.id) in uploads[0].args[0]
    assert str(result.snapshot.id) in uploads[1].args[0]
    assert service._upsert_current_timeline_artifact.await_args.args[1] == uploads[1].args[0]
    session.commit.assert_awaited_once()
