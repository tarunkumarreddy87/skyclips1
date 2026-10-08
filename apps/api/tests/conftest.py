"""Isolated local database fixtures. Never use production data or weaken live auth."""
from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.db.base import Base
from app.db.models import User
from app.main import app


@pytest.fixture(autouse=True)
async def isolated_integration_database(request, monkeypatch):
    if request.node.get_closest_marker("integration") is None:
        yield
        return
    database_url = os.environ.get("SKYCLIP_TEST_DATABASE_URL", settings.database_url)
    if make_url(database_url).host not in {"localhost", "127.0.0.1", "::1"}:
        pytest.skip("Set SKYCLIP_TEST_DATABASE_URL to an isolated local PostgreSQL instance.")
    engine = create_async_engine(database_url)
    # UUID-generated identifier only. Everything, including schema DDL, rolls back.
    schema = "skyclip_test_" + uuid.uuid4().hex
    overrides = app.dependency_overrides.copy()
    monkeypatch.setattr(settings, "internal_api_key", "dev-internal")
    monkeypatch.setattr(settings, "billing_enabled", False)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                # Do not include public: tests must never discover/write existing tables.
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                await connection.run_sync(Base.metadata.create_all)
                async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as seed_session:
                    user = User(external_id="test-" + uuid.uuid4().hex, email="editor-test@example.invalid")
                    seed_session.add(user)
                    await seed_session.flush()
                    user_id = user.id
                    await seed_session.commit()

                async def test_db():
                    # Match production's one session per request: no stale relationships
                    # or expired identity objects carried across HTTP requests.
                    async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as session:
                        yield session

                async def test_user():
                    return User(id=user_id, external_id="integration-user", email="editor-test@example.invalid")

                app.dependency_overrides[get_db] = test_db
                app.dependency_overrides[get_current_user] = test_user
                yield
            finally:
                await transaction.rollback()
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
        await engine.dispose()
