"""Assign only the isolated QA project to the owner of a known browser-visible project."""
import asyncio
import json
import uuid
from pathlib import Path
from app.db.session import async_session_factory
from app.db.models import Project

async def main():
    ctx=json.loads(Path('/tmp/production-agent-smoke-context.json').read_text())
    async with async_session_factory() as session:
        qa=await session.get(Project,uuid.UUID(ctx['project_id']))
        reference=await session.get(Project,uuid.UUID('ebc1dfc0-82e6-4c8d-bbe6-ff61d8a1989d'))
        assert qa and reference and qa.title.startswith('QA main agent:')
        qa.user_id=reference.user_id
        await session.commit()
    print(json.dumps({'qa_owner_updated':True,'reference_project_modified':False}))

asyncio.run(main())
