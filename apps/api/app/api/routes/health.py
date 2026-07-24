import redis.asyncio as redis
from fastapi import APIRouter

from app.config import settings
from app.db.session import check_database

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "hanuman-api"}


@router.get("/health/ready")
async def readiness() -> dict[str, str | bool]:
    db_ok = await check_database()
    redis_ok = False
    try:
        client = redis.from_url(settings.redis_url)
        redis_ok = await client.ping()
        await client.aclose()
    except Exception:
        redis_ok = False

    status = "ok" if db_ok and redis_ok else "degraded"
    return {
        "status": status,
        "database": db_ok,
        "redis": redis_ok,
    }
