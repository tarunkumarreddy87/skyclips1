"""Read-only active generation status before restarting local workers."""
import asyncio
import json
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models import GenerationRun
from app.db.models.enums import GenerationRunStatus
async def main():
    async with async_session_factory() as session:
        rows=(await session.execute(select(GenerationRun).where(GenerationRun.status.in_([GenerationRunStatus.RUNNING,GenerationRunStatus.QUEUED])))).scalars().all()
        print(json.dumps([{'project_id':str(x.project_id),'status':x.status.value,'stage':x.current_stage} for x in rows]))
asyncio.run(main())
