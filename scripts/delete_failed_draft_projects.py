#!/usr/bin/env python3
"""Delete failed + draft projects (handles Postgres enum casing)."""

from __future__ import annotations

import json
import subprocess
import urllib.request
from collections import Counter

API = "http://127.0.0.1:8000"
H = {"X-User-External-Id": "dev-local-user"}

SQL = """
SELECT DISTINCT status::text AS s FROM projects ORDER BY 1;
BEGIN;
DELETE FROM progress_events
 WHERE run_id IN (
   SELECT id FROM generation_runs
    WHERE project_id IN (
      SELECT id FROM projects WHERE lower(status::text) IN ('failed','draft')
    )
 );
DELETE FROM artifacts
 WHERE project_id IN (
   SELECT id FROM projects WHERE lower(status::text) IN ('failed','draft')
 );
DELETE FROM timeline_snapshots
 WHERE project_id IN (
   SELECT id FROM projects WHERE lower(status::text) IN ('failed','draft')
 );
DELETE FROM generation_runs
 WHERE project_id IN (
   SELECT id FROM projects WHERE lower(status::text) IN ('failed','draft')
 );
DELETE FROM quotes
 WHERE project_id IN (
   SELECT id FROM projects WHERE lower(status::text) IN ('failed','draft')
 );
DELETE FROM briefs
 WHERE project_id IN (
   SELECT id FROM projects WHERE lower(status::text) IN ('failed','draft')
 );
DELETE FROM projects WHERE lower(status::text) IN ('failed','draft');
COMMIT;
SELECT status::text, COUNT(*) FROM projects GROUP BY 1 ORDER BY 1;
"""


def main() -> None:
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
        input=SQL,
        capture_output=True,
        text=True,
    )
    print(proc.stdout)
    if proc.returncode != 0:
        print(proc.stderr)
        raise SystemExit(1)

    req = urllib.request.Request(f"{API}/projects", headers=H)
    with urllib.request.urlopen(req, timeout=30) as resp:
        items = json.load(resp)["items"]
    print("api", dict(Counter(p["status"] for p in items)), "total", len(items))


if __name__ == "__main__":
    main()
