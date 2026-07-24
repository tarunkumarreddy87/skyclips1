"""Poll Phase 6 run until complete; download MP4. Does not start a new render."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROJECT_ID = os.environ.get("PHASE6_PROJECT_ID", "1fbee2bc-1a33-4518-847c-d54665285d9d")
RUN_ID = os.environ.get("PHASE6_RUN_ID", "c1e737d5-827f-492b-a8b6-870a6e7f04fe")
API = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
OUT_MP4 = REPO / "packages" / "remotion-renderer" / "proofs" / "phase6-indian-fighters-ui-render.mp4"
LOG = REPO / "scripts" / "_phase6_poll.log"
POLL_SEC = 20.0
TIMEOUT_SEC = 5 * 3600


def http_json(method: str, path: str) -> dict | list | None:
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        headers={"Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else None


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def main() -> int:
    LOG.write_text("", encoding="utf-8")
    log(f"poll project={PROJECT_ID} expect_run={RUN_ID}")
    t0 = time.time()
    last_pct = -1
    while True:
        if time.time() - t0 > TIMEOUT_SEC:
            log("timeout")
            return 1
        latest = http_json("GET", f"/projects/{PROJECT_ID}/runs/latest")
        assert isinstance(latest, dict)
        status = latest.get("status")
        rid = latest.get("id")
        events = http_json("GET", f"/projects/{PROJECT_ID}/progress/events") or []
        pct = None
        msg = ""
        if isinstance(events, list) and events:
            ev = events[-1]
            if isinstance(ev, dict):
                pct = ev.get("percent")
                msg = str(ev.get("message") or "")
        if pct != last_pct:
            last_pct = pct if isinstance(pct, (int, float)) else last_pct
            log(f"run={rid} status={status} percent={pct} {msg}")
        if status == "completed":
            break
        if status == "failed":
            log(f"failed {json.dumps(latest)[:600]}")
            return 1
        time.sleep(POLL_SEC)

    video = http_json("GET", f"/projects/{PROJECT_ID}/video")
    assert isinstance(video, dict)
    url = video.get("downloadUrl") or video.get("download_url")
    dur = video.get("durationSec") or video.get("duration_sec")
    log(f"durationSec={dur}")
    if not url:
        log("missing downloadUrl")
        return 1
    OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
    if OUT_MP4.exists():
        OUT_MP4.unlink()
    with urllib.request.urlopen(str(url), timeout=600) as res, OUT_MP4.open("wb") as out:
        while True:
            chunk = res.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    size = OUT_MP4.stat().st_size
    log(f"PASS {OUT_MP4} bytes={size} elapsed={int(time.time()-t0)}s")
    return 0 if size > 100_000 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)
        sys.exit(1)
