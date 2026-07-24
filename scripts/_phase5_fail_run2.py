import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    eng = create_async_engine("postgresql+asyncpg://hanuman:hanuman@localhost:5432/hanuman")
    async with eng.begin() as c:
        await c.execute(
            text(
                """
                UPDATE generation_runs
                SET status = 'FAILED',
                    error_message = 'superseded by direct phase5 bridge',
                    completed_at = NOW()
                WHERE id = '5bfe7563-1a0d-498f-859a-39b5ef6b82fb'
                """
            )
        )
        await c.execute(
            text(
                """
                UPDATE projects SET status = 'FAILED'
                WHERE id = '1fbee2bc-1a33-4518-847c-d54665285d9d'
                """
            )
        )
        print("ok")
    await eng.dispose()

asyncio.run(main())
