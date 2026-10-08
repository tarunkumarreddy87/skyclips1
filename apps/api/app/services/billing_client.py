"""Server-to-server bridge to the web app's verified Dodo credit ledger."""

from __future__ import annotations

import logging
import uuid

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.services.supabase_auth import supabase_auth_enabled

logger = logging.getLogger(__name__)


async def apply_generation_credits(
    *, user_external_id: str, run_id: uuid.UUID, amount: int, action: str = "debit"
) -> bool:
    """Apply a ledger entry; returns False when billing is off (nothing was charged)."""
    if amount <= 0 or not settings.billing_enabled or not supabase_auth_enabled():
        return False
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"{settings.web_app_url.rstrip('/')}/api/internal/credits",
                headers={"X-Internal-Key": settings.internal_api_key},
                json={
                    "userId": user_external_id,
                    "runId": str(run_id),
                    "amount": amount,
                    "action": action,
                },
            )
    except httpx.HTTPError as exc:
        logger.warning("Credit service unavailable for run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Credit balance could not be verified. Please retry in a moment.",
        ) from exc

    if response.is_success:
        return True
    try:
        detail = response.json().get("error")
    except Exception:
        detail = None
    raise HTTPException(
        status_code=response.status_code if response.status_code in (401, 402, 403, 503) else status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail or "Credit balance could not be verified. Please retry in a moment.",
    )
