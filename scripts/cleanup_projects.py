#!/usr/bin/env python3
"""Stop running projects and delete failed + draft projects."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")
USER = "dev-local-user"
ROOT = Path(__file__).resolve().parents[1]


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def api(method: str, path: str, body: dict | None = None, *, internal: bool = False) -> dict | list | None:
    headers = {"Content-Type": "application/json", "X-User-External-Id": USER}
    if internal:
        headers["X-Internal-Key"] = os.environ.get("INTERNAL_API_KEY", "dev-internal")
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:300]
        raise RuntimeError(f"{method} {path} -> {e.code}: {err}") from e


def temporal_terminate(workflow_id: str) -> bool:
    cmd = [
        "docker",
        "exec",
        "infrastructure-temporal-1",
        "temporal",
        "workflow",
        "terminate",
        "--address",
        "temporal:7233",
        "-n",
        "default",
        "--workflow-id",
        workflow_id,
        "--reason",
        "user cleanup: stop running projects",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode == 0 or "already completed" in out.lower() or "not found" in out.lower():
        return True
    print(f"  temporal warn {workflow_id}: {out.strip()[:160]}")
    return False


def stop_running(projects: list[dict]) -> list[str]:
    stopped: list[str] = []
    for p in projects:
        if p["status"] not in ("running", "queued"):
            continue
        pid = p["id"]
        print(f"STOP {pid[:8]} {p['title'][:40]}")
        run = None
        try:
            run = api("GET", f"/projects/{pid}/runs/latest")
        except Exception as e:
            print(f"  no run: {e}")
        if isinstance(run, dict) and run.get("id"):
            wf = f"video-gen-{run['id']}"
            temporal_terminate(wf)
            # also common render workflow id patterns if any
            try:
                api(
                    "POST",
                    f"/internal/runs/{run['id']}/status",
                    {
                        "status": "cancelled",
                        "currentStage": run.get("currentStage") or "generate_script",
                        "errorMessage": "Stopped by user cleanup",
                        "projectStatus": "failed",
                    },
                    internal=True,
                )
            except Exception as e:
                # cancelled may not be in enum — try failed
                try:
                    api(
                        "POST",
                        f"/internal/runs/{run['id']}/status",
                        {
                            "status": "failed",
                            "currentStage": run.get("currentStage") or "generate_script",
                            "errorMessage": "Stopped by user cleanup",
                            "projectStatus": "failed",
                        },
                        internal=True,
                    )
                except Exception as e2:
                    print(f"  status update failed: {e}; {e2}")
        stopped.append(pid)
    return stopped


def delete_projects_sql(project_ids: list[str]) -> int:
    if not project_ids:
        return 0
    # Use API venv + SQLAlchemy sync via psycopg/asyncpg through docker postgres
    db_url = os.environ.get("DATABASE_URL", "")
    # Prefer docker exec psql for reliability on Windows
    ids_sql = ",".join(f"'{pid}'::uuid" for pid in project_ids)
    sql = f"""
BEGIN;
DELETE FROM progress_events WHERE run_id IN (SELECT id FROM generation_runs WHERE project_id IN ({ids_sql}));
DELETE FROM artifacts WHERE project_id IN ({ids_sql});
DELETE FROM timeline_snapshots WHERE project_id IN ({ids_sql});
DELETE FROM generation_runs WHERE project_id IN ({ids_sql});
DELETE FROM quotes WHERE project_id IN ({ids_sql});
DELETE FROM briefs WHERE project_id IN ({ids_sql});
DELETE FROM projects WHERE id IN ({ids_sql});
COMMIT;
SELECT COUNT(*) FROM projects;
"""
    proc = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            "infrastructure-postgres-1",
            "psql",
            "-U",
            "hanuman",
            "-d",
            "hanuman",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr or proc.stdout}")
    print(proc.stdout.strip())
    return len(project_ids)


def main() -> int:
    load_env()
    data = api("GET", "/projects")
    assert isinstance(data, dict)
    items = data["items"]
    print(f"loaded {len(items)} projects")

    stop_running(items)

    # Refresh list after stop
    data = api("GET", "/projects")
    assert isinstance(data, dict)
    items = data["items"]

    to_delete = [p["id"] for p in items if p["status"] in ("failed", "draft")]
    print(f"DELETE failed+draft count={len(to_delete)}")
    for p in items:
        if p["status"] in ("failed", "draft"):
            print(f"  {p['status']} {p['id'][:8]} {p['title'][:40]}")

    n = delete_projects_sql(to_delete)
    print(f"deleted {n} projects")

    data = api("GET", "/projects")
    assert isinstance(data, dict)
    from collections import Counter

    print("remaining", Counter(p["status"] for p in data["items"]), "total", len(data["items"]))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
