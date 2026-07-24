"""Force-fail Phase 5 stuck render and inspect statuses."""
from __future__ import annotations

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

URL = "postgresql+asyncpg://hanuman:hanuman@localhost:5432/hanuman"
RUN_ID = "fe9900cf-fc36-42d9-ae24-fffe6bb479bd"
PROJECT_ID = "1fbee2bc-1a33-4518-847c-d54665285d9d"


async def main() -> None:
    eng = create_async_engine(URL)
    async with eng.begin() as conn:
        r = await conn.execute(
            text(
                """
                SELECT id::text, status::text, error_message
                FROM generation_runs
                WHERE project_id = :project_id
                ORDER BY started_at DESC
                LIMIT 3
                """
            ),
            {"project_id": PROJECT_ID},
        )
        print("runs_before", r.fetchall())
        await conn.execute(
            text(
                """
                UPDATE generation_runs
                SET status = 'failed',
                    error_message = 'Phase5 restart',
                    completed_at = NOW()
                WHERE id = :run_id
                """
            ),
            {"run_id": RUN_ID},
        )
        await conn.execute(
            text(
                """
                UPDATE projects
                SET status = 'failed'
                WHERE id = :project_id
                """
            ),
            {"project_id": PROJECT_ID},
        )
        r2 = await conn.execute(
            text(
                """
                SELECT id::text, status::text
                FROM generation_runs WHERE id = :run_id
                """
            ),
            {"run_id": RUN_ID},
        )
        print("run_after", r2.fetchall())
        r3 = await conn.execute(
            text("SELECT id::text, status::text FROM projects WHERE id = :project_id"),
            {"project_id": PROJECT_ID},
        )
        print("project_after", r3.fetchall())
    await eng.dispose()


if __name__ == "__main__":
    asyncio.run(main())
