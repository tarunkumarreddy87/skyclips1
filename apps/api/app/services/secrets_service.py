"""Persist workspace API keys to the monorepo .env (gitignored) for local/dev.

Temporary surface for Settings UI — replace with a proper secrets store later.
Never log full key values.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[4]
_ENV_PATH = _REPO_ROOT / ".env"
_SECRETS_JSON = _REPO_ROOT / "data" / "workspace-secrets.json"

# Settings form field → .env variable name
KEY_MAP: dict[str, str] = {
    "sarvamApiKey": "SARVAM_API_KEY",
    "openrouterApiKey": "OPENROUTER_API_KEY",
    "pexelsApiKey": "PEXELS_API_KEY",
}


def _mask(value: str) -> str | None:
    v = value.strip()
    if not v:
        return None
    if len(v) <= 8:
        return "••••" + v[-2:]
    return f"{v[:4]}…{v[-4:]}"


def _read_env_file() -> dict[str, str]:
    if not _ENV_PATH.is_file():
        return {}
    out: dict[str, str] = {}
    for raw in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, val = line.partition("=")
        out[name.strip()] = val.strip().strip('"').strip("'")
    return out


def _write_env_file(vars_map: dict[str, str]) -> None:
    """Upsert KEY=value lines; preserve other content and comments."""
    existing_lines: list[str] = []
    if _ENV_PATH.is_file():
        existing_lines = _ENV_PATH.read_text(encoding="utf-8").splitlines()

    remaining = dict(vars_map)
    written: list[str] = []
    seen: set[str] = set()

    for line in existing_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            name = stripped.partition("=")[0].strip()
            if name in remaining:
                written.append(f"{name}={remaining.pop(name)}")
                seen.add(name)
                continue
        written.append(line)

    if remaining:
        if written and written[-1].strip():
            written.append("")
        written.append("# Updated via Settings → API keys")
        for name, value in remaining.items():
            written.append(f"{name}={value}")
            seen.add(name)

    _ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    _ENV_PATH.write_text("\n".join(written) + "\n", encoding="utf-8")


def _read_secrets_json() -> dict[str, str]:
    if not _SECRETS_JSON.is_file():
        return {}
    try:
        data = json.loads(_SECRETS_JSON.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items() if isinstance(v, str)}


def _write_secrets_json(secrets: dict[str, str]) -> None:
    _SECRETS_JSON.parent.mkdir(parents=True, exist_ok=True)
    _SECRETS_JSON.write_text(json.dumps(secrets, indent=2) + "\n", encoding="utf-8")


def get_api_key_status() -> dict:
    env = _read_env_file()
    file_secrets = _read_secrets_json()
    status: dict = {}
    for field, env_name in KEY_MAP.items():
        value = (
            file_secrets.get(env_name)
            or env.get(env_name)
            or os.environ.get(env_name, "")
        ).strip()
        configured = bool(value)
        status[field] = {
            "configured": configured,
            "hint": _mask(value) if configured else None,
        }
    return status


def update_api_keys(payload: dict[str, str | None]) -> dict:
    """
    Update keys. Empty string / None = leave unchanged.
    Send literal value to set; send "__clear__" to remove.
    """
    env = _read_env_file()
    secrets = _read_secrets_json()
    changed_env: dict[str, str] = {}

    for field, env_name in KEY_MAP.items():
        if field not in payload:
            continue
        raw = payload[field]
        if raw is None or (isinstance(raw, str) and raw.strip() == ""):
            continue
        value = raw.strip()
        if value == "__clear__":
            secrets.pop(env_name, None)
            env.pop(env_name, None)
            changed_env[env_name] = ""
            os.environ.pop(env_name, None)
            continue
        # Basic sanity — reject odd whitespace-only / too short junk
        if len(value) < 8:
            raise ValueError(f"{field} looks too short to be a valid API key")
        if re.search(r"[\r\n]", value):
            raise ValueError(f"{field} must be a single line")
        secrets[env_name] = value
        changed_env[env_name] = value
        os.environ[env_name] = value

    if changed_env:
        # Merge into full env map then write (empty string clears)
        for name, value in changed_env.items():
            if value == "":
                env.pop(name, None)
            else:
                env[name] = value
        # Rewrite only the keys we manage from current env+changes
        managed = {name: env[name] for name in KEY_MAP.values() if name in env and env[name]}
        # Preserve unmanaged keys: load full file and replace managed lines
        full = _read_env_file()
        for name, value in changed_env.items():
            if value == "":
                full.pop(name, None)
            else:
                full[name] = value
        # Upsert only changed managed keys onto existing file lines
        _write_env_file({k: v for k, v in full.items()})
        _write_secrets_json(secrets)

    return get_api_key_status()
