"""Unit tests for Supabase Auth gate in get_current_user."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.deps import get_current_user
from app.services.supabase_auth import SupabaseIdentity


@pytest.mark.asyncio
async def test_missing_bearer_when_supabase_enabled() -> None:
    session = MagicMock()
    with patch("app.api.deps.supabase_auth_enabled", return_value=True):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(session=session, authorization=None, x_user_external_id="spoof")
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_rejects_spoof_header_when_token_invalid() -> None:
    session = MagicMock()
    with (
        patch("app.api.deps.supabase_auth_enabled", return_value=True),
        patch("app.api.deps.verify_supabase_access_token", new_callable=AsyncMock, return_value=None),
    ):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(
                session=session,
                authorization="Bearer bad-token",
                x_user_external_id="spoof-user",
            )
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_upserts_user_from_verified_token() -> None:
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.add = MagicMock()

    identity = SupabaseIdentity(sub="supabase-user-1", email="a@example.com")

    with (
        patch("app.api.deps.supabase_auth_enabled", return_value=True),
        patch(
            "app.api.deps.verify_supabase_access_token",
            new_callable=AsyncMock,
            return_value=identity,
        ),
    ):
        user = await get_current_user(
            session=session,
            authorization="Bearer good-token",
            x_user_external_id="spoof-ignored",
        )

    assert user.external_id == "supabase-user-1"
    assert user.email == "a@example.com"
    session.add.assert_called_once()
