"""Recover project rows from S3 artifacts after Postgres data loss.

Scans `projects/{project_id}/runs/{run_id}/` keys, rebuilds minimal DB rows so
list/detail/download endpoints work again. Idempotent: skips projects already present.
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

import boto3
from botocore.client import Config

from app.config import settings
from app.db.models import (
    Artifact,
    ArtifactType,
    Brief,
    EntryPath,
    FormatMode,
    GenerationRun,
    GenerationRunStatus,
    Project,
    ProjectStatus,
    Quote,
    QuoteStatus,
)
from app.db.session import async_session_factory

DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OBJECT_KEY_RE = re.compile(
    r"^projects/(?P<project_id>[0-9a-f-]{36})/runs/(?P<run_id>[0-9a-f-]{36})/(?P<name>.+)$"
)


@dataclass
class S3ObjectRef:
    key: str
    size: int
    last_modified: datetime


@dataclass
class RunBucket:
    run_id: uuid.UUID
    final_video: S3ObjectRef | None = None
    timeline: S3ObjectRef | None = None
    script: S3ObjectRef | None = None


@dataclass
class ProjectBucket:
    project_id: uuid.UUID
    runs: dict[uuid.UUID, RunBucket] = field(default_factory=dict)


def _s3_client():
    endpoint = (settings.s3_endpoint or "").strip() or None
    access_key = (settings.s3_access_key or "").strip() or None
    secret_key = (settings.s3_secret_key or "").strip() or None
    if access_key == "minioadmin" and not endpoint:
        access_key = None
        secret_key = None
    kwargs: dict = {
        "region_name": settings.s3_region,
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"} if endpoint else {},
        ),
    }
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)


def _scan_projects(client, bucket: str) -> dict[uuid.UUID, ProjectBucket]:
    projects: dict[uuid.UUID, ProjectBucket] = {}
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="projects/"):
        for obj in page.get("Contents") or []:
            key = obj["Key"]
            match = OBJECT_KEY_RE.match(key)
            if not match:
                continue
            project_id = uuid.UUID(match.group("project_id"))
            run_id = uuid.UUID(match.group("run_id"))
            name = match.group("name")
            ref = S3ObjectRef(
                key=key,
                size=int(obj["Size"]),
                last_modified=obj["LastModified"].replace(tzinfo=UTC)
                if obj["LastModified"].tzinfo is None
                else obj["LastModified"],
            )
            bucket_row = projects.setdefault(project_id, ProjectBucket(project_id=project_id))
            run_row = bucket_row.runs.setdefault(run_id, RunBucket(run_id=run_id))
            if name == "final.mp4":
                run_row.final_video = ref
            elif name == "timeline.v1.json":
                run_row.timeline = ref
            elif name == "script.json":
                run_row.script = ref
    return projects


def _pick_run(project: ProjectBucket) -> RunBucket | None:
    runs = list(project.runs.values())
    if not runs:
        return None

    def sort_key(run: RunBucket) -> datetime:
        candidates = [run.final_video, run.timeline, run.script]
        times = [c.last_modified for c in candidates if c is not None]
        return max(times) if times else datetime.min.replace(tzinfo=UTC)

    with_final = [r for r in runs if r.final_video is not None]
    if with_final:
        return max(with_final, key=lambda r: r.final_video.last_modified)  # type: ignore[union-attr]
    with_timeline = [r for r in runs if r.timeline is not None]
    if with_timeline:
        return max(with_timeline, key=lambda r: r.timeline.last_modified)  # type: ignore[union-attr]
    with_script = [r for r in runs if r.script is not None]
    if with_script:
        return max(with_script, key=lambda r: r.script.last_modified)  # type: ignore[union-attr]
    return None


def _load_json(client, bucket: str, ref: S3ObjectRef | None) -> dict | None:
    if ref is None:
        return None
    body = client.get_object(Bucket=bucket, Key=ref.key)["Body"].read()
    return json.loads(body.decode("utf-8"))


def _title_from_script(script: dict | None) -> str | None:
    if not script:
        return None
    sections = script.get("sections") or []
    if sections and isinstance(sections[0], dict):
        title = sections[0].get("title")
        if isinstance(title, str) and title.strip():
            return title.strip()
    return None


def _derive_metadata(
    client,
    bucket: str,
    project: ProjectBucket,
    run: RunBucket,
) -> dict:
    timeline = _load_json(client, bucket, run.timeline)
    script = _load_json(client, bucket, run.script)
    if script is None:
        for candidate in project.runs.values():
            if candidate.script is not None:
                script = _load_json(client, bucket, candidate.script)
                if script:
                    break

    meta = timeline.get("metadata", {}) if timeline else {}
    format_mode = meta.get("format_mode") or (script or {}).get("format_mode") or "documentary"
    duration_sec = meta.get("duration_sec")
    if duration_sec is None and script:
        duration_sec = script.get("target_duration_sec") or script.get("estimated_spoken_sec")
    language = (script or {}).get("language") or "en"
    title = _title_from_script(script) or f"Recovered video {str(project.project_id)[:8]}"

    prompt_text = None
    if script:
        sections = script.get("sections") or []
        if sections and isinstance(sections[0], dict):
            narration = sections[0].get("narration")
            if isinstance(narration, str) and narration.strip():
                prompt_text = narration.strip()[:2000]

    section_outline = []
    if script:
        for section in script.get("sections") or []:
            if not isinstance(section, dict):
                continue
            title = section.get("title")
            if not isinstance(title, str) or not title.strip():
                continue
            narration = section.get("narration")
            if isinstance(narration, str) and narration.strip():
                summary = narration.strip()
                if len(summary) > 500:
                    summary = summary[:497] + "..."
            else:
                summary = title.strip()[:500]
            section_outline.append({"title": title.strip()[:200], "summary": summary})

    return {
        "title": title,
        "format_mode": format_mode,
        "duration_sec": int(float(duration_sec)) if duration_sec is not None else 300,
        "language": language,
        "prompt_text": prompt_text,
        "section_outline": section_outline,
        "timeline": timeline,
    }


async def _recover_one(
    session,
    client,
    bucket: str,
    project_bucket: ProjectBucket,
) -> str:
    existing = await session.get(Project, project_bucket.project_id)
    if existing is not None:
        return f"skip existing {project_bucket.project_id}"

    run = _pick_run(project_bucket)
    if run is None:
        return f"skip empty {project_bucket.project_id}"

    info = _derive_metadata(client, bucket, project_bucket, run)
    format_mode = FormatMode(info["format_mode"])
    completed = run.final_video is not None
    project_status = ProjectStatus.COMPLETED if completed else ProjectStatus.RUNNING
    run_status = GenerationRunStatus.COMPLETED if completed else GenerationRunStatus.RUNNING

    stamp = (
        run.final_video.last_modified
        if run.final_video
        else run.timeline.last_modified
        if run.timeline
        else run.script.last_modified
        if run.script
        else datetime.now(UTC)
    )

    quote_id = uuid.uuid4()
    project = Project(
        id=project_bucket.project_id,
        user_id=DEV_USER_ID,
        title=info["title"],
        status=project_status,
        entry_path=EntryPath.PROMPT_FIRST,
        format_mode=format_mode,
        created_at=stamp,
        updated_at=stamp,
    )
    brief = Brief(
        project_id=project.id,
        prompt_text=info["prompt_text"],
        target_duration_sec=info["duration_sec"],
        language=info["language"],
    )
    quote = Quote(
        id=quote_id,
        project_id=project.id,
        version=1,
        is_active=True,
        format_mode=format_mode,
        duration_sec=info["duration_sec"],
        language=info["language"],
        voice_id="shubh",
        section_outline=info["section_outline"],
        credit_estimate=42,
        status=QuoteStatus.APPROVED,
        approved_at=stamp,
        created_at=stamp,
    )
    generation_run = GenerationRun(
        id=run.run_id,
        project_id=project.id,
        quote_id=quote.id,
        status=run_status,
        current_stage="recovered_from_s3",
        started_at=stamp,
        completed_at=stamp if completed else None,
        created_at=stamp,
    )

    session.add(project)
    session.add(brief)
    session.add(quote)
    session.add(generation_run)

    if run.timeline is not None:
        session.add(
            Artifact(
                project_id=project.id,
                run_id=run.run_id,
                type=ArtifactType.TIMELINE,
                s3_bucket=bucket,
                s3_key=run.timeline.key,
                content_type="application/json",
                size_bytes=run.timeline.size,
                metadata_={},
                created_at=run.timeline.last_modified,
            )
        )

    if run.script is not None:
        session.add(
            Artifact(
                project_id=project.id,
                run_id=run.run_id,
                type=ArtifactType.SCRIPT,
                s3_bucket=bucket,
                s3_key=run.script.key,
                content_type="application/json",
                size_bytes=run.script.size,
                metadata_={},
                created_at=run.script.last_modified,
            )
        )

    if run.final_video is not None:
        session.add(
            Artifact(
                project_id=project.id,
                run_id=run.run_id,
                type=ArtifactType.FINAL_VIDEO,
                s3_bucket=bucket,
                s3_key=run.final_video.key,
                content_type="video/mp4",
                size_bytes=run.final_video.size,
                metadata_={"duration_sec": info["duration_sec"]},
                created_at=run.final_video.last_modified,
            )
        )

    await session.commit()
    return f"recovered {project.id} ({info['title']}) status={project_status.value}"


async def main() -> int:
    bucket = settings.s3_bucket
    client = _s3_client()
    projects = _scan_projects(client, bucket)
    if not projects:
        print(f"No project prefixes found in s3://{bucket}/projects/")
        return 0

    print(f"Found {len(projects)} project prefix(es) in s3://{bucket}/projects/")
    async with async_session_factory() as session:
        results: list[str] = []
        for project_id in sorted(projects, key=str):
            result = await _recover_one(session, client, bucket, projects[project_id])
            results.append(result)
            print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
