"""Poll Phase 6; download MP4. No new render. Stdout only (no log file lock)."""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:8000"
PID = "1fbee2bc-1a33-4518-847c-d54665285d9d"
EXPECT_RUN = "7e0e21d3-8390-4bcb-bbbe-9b628dec0f0a"
OUT = Path(__file__).resolve().parents[1] / "workers/media/proofs/phase6-indian-fighters-ui-render.mp4"


def get(path: str):
    with urllib.request.urlopen(f"{API}{path}", timeout=120) as res:
        return json.loads(res.read().decode())


def main() -> int:
    t0 = time.time()
    last = ""
    while True:
        r = get(f"/projects/{PID}/runs/latest")
        rid = r.get("id")
        if rid != EXPECT_RUN:
            print(f"{int(time.time() - t0)}s waiting for run {EXPECT_RUN[:8]} (latest={rid})", flush=True)
            time.sleep(5)
            continue
        ev = get(f"/projects/{PID}/progress/events") or []
        scoped = [e for e in ev if isinstance(e, dict) and e.get("runId") == EXPECT_RUN]
        msg = scoped[-1] if scoped else {}
        line = (
            f"{int(time.time() - t0)}s status={r.get('status')} "
            f"pct={msg.get('percent')} {msg.get('message')}"
        )
        if line != last:
            print(line, flush=True)
            last = line
        if r.get("status") == "completed":
            break
        if r.get("status") == "failed":
            print("FAILED", json.dumps(r)[:800], flush=True)
            return 1
        time.sleep(25)

    v = get(f"/projects/{PID}/video")
    url = v.get("downloadUrl")
    print("durationSec", v.get("durationSec"), flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    with urllib.request.urlopen(url, timeout=600) as res, OUT.open("wb") as f:
        while True:
            c = res.read(1024 * 1024)
            if not c:
                break
            f.write(c)
    print("PASS", OUT, OUT.stat().st_size, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
