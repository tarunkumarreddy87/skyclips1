"""Editor timeline persistence: autosave snapshots, history, and magic reset."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Artifact, ArtifactType, Project, TimelineSnapshot, User
from app.schemas.generation import (
    RestoreSnapshotResponse,
    SaveTimelineRequest,
    SaveTimelineResponse,
    TimelineResponse,
    TimelineSnapshotMeta,
)
from app.schemas.common import to_iso
from app.services.storage import StorageService

logger = logging.getLogger(__name__)

# Keep the pinned original + this many non-original snapshots (oldest pruned).
MAX_NON_ORIGINAL_SNAPSHOTS = 40


class EditorSnapshotService:
    def __init__(self, session: AsyncSession, storage: StorageService) -> None:
        self.session = session
        self.storage = storage

    async def save_timeline(
        self,
        user: User,
        project_id: uuid.UUID,
        payload: SaveTimelineRequest,
    ) -> SaveTimelineResponse:
        project = await self._get_project(user, project_id)
        await self._ensure_original_snapshot(project)

        snap_id = uuid.uuid4()
        label = (payload.label or "Autosave").strip() or "Autosave"
        action_type = (payload.action_type or "autosave").strip() or "autosave"

        editor_key = f"projects/{project.id}/editor/snapshots/{snap_id}/editor.json"
        timeline_key = f"projects/{project.id}/editor/snapshots/{snap_id}/timeline.v1.json"
        editor_bytes = json.dumps(payload.editor_document).encode("utf-8")
        timeline_bytes = json.dumps(payload.timeline_manifest).encode("utf-8")

        self.storage.upload_bytes(editor_key, editor_bytes, "application/json")
        self.storage.upload_bytes(timeline_key, timeline_bytes, "application/json")

        # Also update the "current" TIMELINE artifact pointer so render / get_timeline stay aligned.
        await self._upsert_current_timeline_artifact(project, timeline_key, len(timeline_bytes))

        snap = TimelineSnapshot(
            id=snap_id,
            project_id=project.id,
            label=label[:255],
            action_type=action_type[:64],
            is_original=False,
            editor_s3_key=editor_key,
            timeline_s3_key=timeline_key,
            metadata_={},
        )
        self.session.add(snap)
        await self.session.flush()
        await self._prune_snapshots(project.id)
        await self.session.commit()
        await self.session.refresh(snap)

        history = await self._list_snapshot_metas(project.id)
        return SaveTimelineResponse(snapshot=self._meta(snap), history=history)

    async def list_snapshots(self, user: User, project_id: uuid.UUID) -> list[TimelineSnapshotMeta]:
        project = await self._get_project(user, project_id)
        if await self._earliest_timeline_artifact(project.id) is None:
            return []
        await self._ensure_original_snapshot(project)
        await self.session.commit()
        return await self._list_snapshot_metas(project.id)

    async def restore_snapshot(
        self,
        user: User,
        project_id: uuid.UUID,
        snapshot_id: uuid.UUID,
    ) -> RestoreSnapshotResponse:
        project = await self._get_project(user, project_id)
        snap = await self._get_snapshot(project.id, snapshot_id)

        editor_doc = self._load_editor_document(snap)
        timeline_manifest = json.loads(self.storage.get_object_bytes(snap.timeline_s3_key).decode("utf-8"))
        timeline_bytes = json.dumps(timeline_manifest).encode("utf-8")

        # Persist restore as a new current autosave so reopen shows restored state,
        # without mutating the historical snapshot being restored from.
        restore_id = uuid.uuid4()
        editor_key: str | None = None
        # Prefer copying the source timeline key for originals; otherwise write a fresh copy.
        if snap.is_original and not editor_doc:
            timeline_key = snap.timeline_s3_key
        else:
            timeline_key = f"projects/{project.id}/editor/snapshots/{restore_id}/timeline.v1.json"
            self.storage.upload_bytes(timeline_key, timeline_bytes, "application/json")
            if editor_doc:
                editor_key = f"projects/{project.id}/editor/snapshots/{restore_id}/editor.json"
                self.storage.upload_bytes(
                    editor_key, json.dumps(editor_doc).encode("utf-8"), "application/json"
                )

        await self._upsert_current_timeline_artifact(project, timeline_key, len(timeline_bytes))

        restored = TimelineSnapshot(
            id=restore_id,
            project_id=project.id,
            label=f"Restored: {snap.label}"[:255],
            action_type="reset" if snap.is_original else "restore",
            is_original=False,
            editor_s3_key=editor_key,
            timeline_s3_key=timeline_key,
            metadata_={"restoredFrom": str(snap.id)},
        )
        self.session.add(restored)
        await self.session.flush()
        await self._prune_snapshots(project.id)
        await self.session.commit()
        await self.session.refresh(restored)

        history = await self._list_snapshot_metas(project.id)
        media_urls = self._media_urls_from_manifest(timeline_manifest)
        return RestoreSnapshotResponse(
            snapshot=self._meta(restored),
            editor_document=editor_doc,
            timeline_manifest=timeline_manifest,
            media_urls=media_urls,
            history=history,
        )

    async def reset_timeline(self, user: User, project_id: uuid.UUID) -> RestoreSnapshotResponse:
        """Magic Reset: restore the pinned original AI-generated timeline."""
        project = await self._get_project(user, project_id)
        original = await self._ensure_original_snapshot(project)
        await self.session.commit()
        return await self.restore_snapshot(user, project_id, original.id)

    async def get_editor_timeline(self, user: User, project_id: uuid.UUID) -> TimelineResponse:
        """Latest saved editor state when present; otherwise generation TIMELINE artifact."""
        project = await self._get_project(user, project_id)
        if await self._earliest_timeline_artifact(project.id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "timeline_not_ready",
                    "message": "Timeline not available. Complete video generation first.",
                    "projectStatus": project.status.value,
                },
            )
        await self._ensure_original_snapshot(project)
        await self.session.commit()

        latest = await self._latest_snapshot(project.id)
        if latest is not None:
            # Fast path: editor document alone is enough for the client (it ignores
            # timeline.v1 when editorDocument is present). Skipping the second S3
            # download cuts open latency roughly in half for edited projects.
            if latest.editor_s3_key:
                editor_doc = await asyncio.to_thread(self._load_editor_document, latest)
                if editor_doc:
                    media_urls = await asyncio.to_thread(
                        self._media_urls_from_editor_document, editor_doc
                    )
                    return TimelineResponse(
                        artifact_id=str(latest.id),
                        # Stub — client hydrates from editor_document only.
                        manifest={"version": "1.0", "fps": 30, "width": 1920, "height": 1080, "tracks": {}},
                        media_urls=media_urls,
                        editor_document=editor_doc,
                        snapshot_id=str(latest.id),
                    )

            # Run synchronous S3 downloads in a thread pool so they don't block the
            # async event loop (each file is 300-600KB; without this, all API requests
            # stall for 20+ seconds while the timeline + editor JSON are downloaded).
            editor_doc, raw_manifest = await asyncio.gather(
                asyncio.to_thread(self._load_editor_document, latest) if latest.editor_s3_key else asyncio.sleep(0, result=None),
                asyncio.to_thread(self.storage.get_object_bytes, latest.timeline_s3_key),
            )
            if editor_doc == {}:
                editor_doc = None
            timeline_manifest = json.loads(raw_manifest.decode("utf-8"))
            media_urls = await asyncio.to_thread(self._media_urls_from_manifest, timeline_manifest)
            return TimelineResponse(
                artifact_id=str(latest.id),
                manifest=timeline_manifest,
                media_urls=media_urls,
                editor_document=editor_doc,
                snapshot_id=str(latest.id),
            )

        # Fallback: raw generation timeline artifact (no snapshots yet)
        artifact = await self._latest_timeline_artifact(project.id)
        if artifact is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timeline manifest not found. Complete generation first.",
            )
        raw_bytes = await asyncio.to_thread(self.storage.get_object_bytes, artifact.s3_key)
        manifest = json.loads(raw_bytes.decode("utf-8"))
        media_urls = await asyncio.to_thread(self._media_urls_from_manifest, manifest)
        return TimelineResponse(
            artifact_id=str(artifact.id),
            manifest=manifest,
            media_urls=media_urls,
            editor_document=None,
            snapshot_id=None,
        )

    async def latest_timeline_s3_key(self, project_id: uuid.UUID) -> str | None:
        latest = await self._latest_snapshot(project_id)
        if latest is not None:
            return latest.timeline_s3_key
        artifact = await self._latest_timeline_artifact(project_id)
        return artifact.s3_key if artifact else None

    # ── private ──────────────────────────────────────────────────────────

    async def _get_project(self, user: User, project_id: uuid.UUID) -> Project:
        stmt = (
            select(Project)
            .options(selectinload(Project.brief))
            .where(Project.id == project_id, Project.user_id == user.id)
        )
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _get_snapshot(self, project_id: uuid.UUID, snapshot_id: uuid.UUID) -> TimelineSnapshot:
        stmt = select(TimelineSnapshot).where(
            TimelineSnapshot.project_id == project_id,
            TimelineSnapshot.id == snapshot_id,
        )
        result = await self.session.execute(stmt)
        snap = result.scalar_one_or_none()
        if snap is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
        return snap

    async def _latest_snapshot(self, project_id: uuid.UUID) -> TimelineSnapshot | None:
        stmt = (
            select(TimelineSnapshot)
            .where(TimelineSnapshot.project_id == project_id)
            .order_by(TimelineSnapshot.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _latest_timeline_artifact(self, project_id: uuid.UUID) -> Artifact | None:
        stmt = (
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.type == ArtifactType.TIMELINE)
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _ensure_original_snapshot(self, project: Project) -> TimelineSnapshot:
        # Concurrent editor loads can create duplicate pinned originals — keep earliest, demote rest.
        project_id = project.id
        stmt = (
            select(TimelineSnapshot)
            .where(
                TimelineSnapshot.project_id == project_id,
                TimelineSnapshot.is_original.is_(True),
            )
            .order_by(TimelineSnapshot.created_at.asc())
        )
        result = await self.session.execute(stmt)
        originals = list(result.scalars().all())
        if originals:
            keep = originals[0]
            for dup in originals[1:]:
                await self.session.delete(dup)
            if len(originals) > 1:
                await self.session.flush()
            return keep

        # Pin the earliest generation TIMELINE — not the latest autosave/render artifact.
        artifact = await self._earliest_timeline_artifact(project_id)
        if artifact is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timeline manifest not found. Complete generation first.",
            )

        snap_id = uuid.uuid4()
        # Point original snapshot at the generation TIMELINE key (immutable source of truth).
        # Editor document filled on first real autosave / when client seeds it.
        snap = TimelineSnapshot(
            id=snap_id,
            project_id=project_id,
            label="Original AI-generated version",
            action_type="generate",
            is_original=True,
            editor_s3_key=None,
            timeline_s3_key=artifact.s3_key,
            metadata_={"sourceArtifactId": str(artifact.id)},
        )
        try:
            # Savepoint so a unique-constraint race does not expire the outer session
            # (full rollback → MissingGreenlet when accessing expired ORM attrs).
            async with self.session.begin_nested():
                self.session.add(snap)
                await self.session.flush()
            return snap
        except IntegrityError:
            stmt = (
                select(TimelineSnapshot)
                .where(
                    TimelineSnapshot.project_id == project_id,
                    TimelineSnapshot.is_original.is_(True),
                )
                .order_by(TimelineSnapshot.created_at.asc())
                .limit(1)
            )
            result = await self.session.execute(stmt)
            winner = result.scalar_one_or_none()
            if winner is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not pin original timeline snapshot. Retry.",
                )
            return winner

    async def _earliest_timeline_artifact(self, project_id: uuid.UUID) -> Artifact | None:
        stmt = (
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.type == ArtifactType.TIMELINE)
            .order_by(Artifact.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _upsert_current_timeline_artifact(
        self, project: Project, timeline_key: str, size_bytes: int
    ) -> None:
        """Write a TIMELINE artifact so render jobs without an inline body still see edits."""
        artifact = Artifact(
            id=uuid.uuid4(),
            project_id=project.id,
            run_id=None,
            type=ArtifactType.TIMELINE,
            s3_bucket=self.storage.bucket,
            s3_key=timeline_key,
            content_type="application/json",
            size_bytes=size_bytes,
            metadata_={"source": "editor_autosave", "updatedAt": datetime.now(UTC).isoformat()},
        )
        self.session.add(artifact)

    async def _prune_snapshots(self, project_id: uuid.UUID) -> None:
        stmt = (
            select(TimelineSnapshot)
            .where(
                TimelineSnapshot.project_id == project_id,
                TimelineSnapshot.is_original.is_(False),
            )
            .order_by(TimelineSnapshot.created_at.desc())
        )
        result = await self.session.execute(stmt)
        snaps = list(result.scalars().all())
        for stale in snaps[MAX_NON_ORIGINAL_SNAPSHOTS:]:
            await self.session.delete(stale)

    async def _list_snapshot_metas(self, project_id: uuid.UUID) -> list[TimelineSnapshotMeta]:
        stmt = (
            select(TimelineSnapshot)
            .where(
                TimelineSnapshot.project_id == project_id,
                TimelineSnapshot.action_type != "demoted",
            )
            .order_by(TimelineSnapshot.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return [self._meta(s) for s in result.scalars().all()]

    def _meta(self, snap: TimelineSnapshot) -> TimelineSnapshotMeta:
        return TimelineSnapshotMeta(
            id=str(snap.id),
            label=snap.label,
            action_type=snap.action_type,
            is_original=snap.is_original,
            created_at=to_iso(snap.created_at) if snap.created_at else datetime.now(UTC).isoformat(),
        )

    def _load_editor_document(self, snap: TimelineSnapshot) -> dict:
        if snap.editor_s3_key:
            return json.loads(self.storage.get_object_bytes(snap.editor_s3_key).decode("utf-8"))
        # Original snapshot without editor doc — client maps from timeline.v1
        return {}

    def _media_urls_from_manifest(self, manifest: dict) -> dict[str, str]:
        media_urls: dict[str, str] = {}
        tracks = manifest.get("tracks", {})
        for clip in [
            *tracks.get("video", []),
            *tracks.get("audio", []),
            *tracks.get("broll", []),
            *tracks.get("music", []),
        ]:
            src = clip.get("src")
            if not src or src in media_urls:
                continue
            if isinstance(src, str) and (src.startswith("http://") or src.startswith("https://")):
                media_urls[src] = src
            else:
                media_urls[src] = self.storage.presigned_download_url(src)
        return media_urls

    def _media_urls_from_editor_document(self, editor_doc: dict) -> dict[str, str]:
        """Presign asset object keys from the saved editor document (no timeline.v1 needed)."""
        media_urls: dict[str, str] = {}

        def add(src: object) -> None:
            if not isinstance(src, str) or not src or src in media_urls:
                return
            if src.startswith(("http://", "https://", "blob:", "data:", "/")):
                media_urls[src] = src
                return
            # Object key (projects/... or similar)
            if "/" in src or src.startswith("projects/"):
                media_urls[src] = self.storage.presigned_download_url(src)

        for asset in editor_doc.get("assets") or []:
            if not isinstance(asset, dict):
                continue
            meta = asset.get("metadata") or {}
            if isinstance(meta, dict):
                add(meta.get("sourceKey"))
            add(asset.get("url"))
            add(asset.get("thumbnailUrl"))
        return media_urls
