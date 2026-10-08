"""Verify Supabase Auth JWTs (Auth only — no Supabase business DB)."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)

_jwks_client: PyJWKClient | None = None
_jwks_base: str | None = None
_ASYMMETRIC_ALGORITHMS = frozenset({"ES256", "RS256"})
_KEY_TYPES = {"ES256": "EC", "RS256": "RSA"}
_MAX_TOKEN_CHARS = 16_384


@dataclass(frozen=True)
class SupabaseIdentity:
    sub: str
    email: str | None


def supabase_auth_enabled() -> bool:
    return bool(
        settings.supabase_url.strip()
        and (settings.supabase_jwt_secret.strip() or settings.supabase_anon_key.strip())
    )


def _base_url() -> str:
    return settings.supabase_url.strip().rstrip("/")


def _issuer() -> str:
    return f"{_base_url()}/auth/v1"


def _jwks() -> PyJWKClient | None:
    global _jwks_client, _jwks_base
    base = _base_url()
    if not base:
        return None
    if _jwks_client is None or _jwks_base != base:
        _jwks_client = PyJWKClient(
            f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True
        )
        _jwks_base = base
    return _jwks_client


def _decode_with_secret(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.supabase_jwt_secret.strip(),
        algorithms=["HS256"],
        audience="authenticated",
        issuer=_issuer(),
        options={"require": ["sub", "exp", "iss"]},
    )


def _decode_with_jwks(token: str, algorithm: str) -> dict[str, Any] | None:
    """Verify one asymmetric algorithm; never mix HMAC and public-key families."""
    if algorithm not in _ASYMMETRIC_ALGORITHMS:
        return None
    client = _jwks()
    if client is None:
        return None
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        if signing_key.key_type != _KEY_TYPES[algorithm]:
            return None
        if signing_key.algorithm_name and signing_key.algorithm_name != algorithm:
            return None
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=_issuer(),
            options={"require": ["sub", "exp", "iss"]},
        )
    except Exception as exc:
        logger.debug("JWKS verify failed: %s", type(exc).__name__)
        return None


async def _verify_via_auth_api(token: str) -> SupabaseIdentity | None:
    """Verify a legacy HS256 token when no local JWT secret is available."""
    base = _base_url()
    anon = settings.supabase_anon_key.strip()
    if not base or not anon:
        return None
    headers = {"Authorization": f"Bearer {token}", "apikey": anon}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{base}/auth/v1/user", headers=headers)
        if res.status_code != 200:
            return None
        body = res.json()
        sub = str(body.get("id") or "").strip()
        if not sub:
            return None
        email = body.get("email")
        return SupabaseIdentity(sub=sub, email=str(email) if email else None)
    except Exception as exc:
        logger.warning("Supabase /user verify failed: %s", type(exc).__name__)
        return None


def _identity_from_claims(claims: dict[str, Any] | None) -> SupabaseIdentity | None:
    if not claims:
        return None
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        return None
    email = claims.get("email")
    return SupabaseIdentity(sub=sub, email=str(email) if email else None)


async def verify_supabase_access_token(token: str) -> SupabaseIdentity | None:
    """Validate an access token with an algorithm-pinned local verification path."""
    token = (token or "").strip()
    if not token or len(token) > _MAX_TOKEN_CHARS:
        return None
    try:
        algorithm = str(jwt.get_unverified_header(token).get("alg") or "")
    except jwt.PyJWTError:
        return None

    if algorithm == "HS256":
        secret = settings.supabase_jwt_secret.strip()
        if not secret:
            # Legacy Supabase symmetric tokens require the authenticated /user API.
            return await _verify_via_auth_api(token)
        try:
            return _identity_from_claims(_decode_with_secret(token))
        except jwt.PyJWTError:
            return None

    if algorithm in _ASYMMETRIC_ALGORITHMS:
        # PyJWKClient is synchronous network I/O; keep it off the FastAPI event loop.
        claims = await asyncio.to_thread(_decode_with_jwks, token, algorithm)
        return _identity_from_claims(claims)

    return None
