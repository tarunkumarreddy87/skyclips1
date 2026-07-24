"""Phase 6: UI-equivalent Render path for Indian Fighters (Temporal + Remotion).

Mirrors apps/web `startRender(projectId, manifest)` after editor flushSave —
POST /projects/{id}/render with the live timeline body. Not the direct bridge.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROJECT_ID = os.environ.get(
    "PHASE6_PROJECT_ID", "1fbee2bc-1a33-4518-847c-d54665285d9d"
)
API = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
OUT_DIR = REPO / "packages" / "remotion-renderer" / "proofs"
OUT_MP4 = OUT_DIR / "phase6-indian-fighters-ui-render.mp4"
LOG = REPO / "scripts" / "_phase6_ui_render.log"
POLL_SEC = float(os.environ.get("PHASE6_POLL_SEC", "15"))
TIMEOUT_SEC = float(os.environ.get("PHASE6_TIMEOUT_SEC", str(5 * 3600)))


def http_json(method: str, path: str, body: dict | None = None) -> dict | list | None:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from e


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def main() -> int:
    LOG.write_text("", encoding="utf-8")
    log(f"Phase 6 start project={PROJECT_ID} api={API}")

    project = http_json("GET", f"/projects/{PROJECT_ID}")
    assert isinstance(project, dict)
    log(f"project status={project.get('status')} title={project.get('title')!r}")

    timeline = http_json("GET", f"/projects/{PROJECT_ID}/timeline")
    assert isinstance(timeline, dict)
    manifest = timeline.get("manifest") or timeline
    if not isinstance(manifest, dict) or "tracks" not in manifest:
        log("ERROR: timeline response missing manifest.tracks")
        return 1
    n_v = len((manifest.get("tracks") or {}).get("video") or [])
    n_a = len((manifest.get("tracks") or {}).get("audio") or [])
    n_t = len(manifest.get("transitions") or [])
    n_o = len(manifest.get("overlays") or [])
    log(f"manifest video={n_v} audio={n_a} transitions={n_t} overlays={n_o}")

    started = http_json(
        "POST",
        f"/projects/{PROJECT_ID}/render",
        {"timelineManifest": manifest},
    )
    assert isinstance(started, dict)
    run = started.get("run") or {}
    run_id = run.get("id")
    wf = started.get("workflowId") or started.get("workflow_id")
    log(f"started run={run_id} workflow={wf} (same path as UI Render video)")

    t0 = time.time()
    last_pct = -1
    while True:
        elapsed = time.time() - t0
        if elapsed > TIMEOUT_SEC:
            log("ERROR: timeout waiting for render")
            return 1

        latest = http_json("GET", f"/projects/{PROJECT_ID}/runs/latest")
        status = (latest or {}).get("status") if isinstance(latest, dict) else None
        events = http_json("GET", f"/projects/{PROJECT_ID}/progress/events") or []
        pct = None
        msg = ""
        if isinstance(events, list) and events:
            ev = events[-1]
            if isinstance(ev, dict):
                pct = ev.get("percent")
                msg = str(ev.get("message") or "")
        if pct is not None and pct != last_pct:
            last_pct = int(pct) if isinstance(pct, (int, float)) else last_pct
            log(f"progress status={status} percent={pct} {msg}")
        elif int(elapsed) % 60 < POLL_SEC:
            log(f"waiting status={status} elapsed={int(elapsed)}s")

        if status == "completed":
            break
        if status == "failed":
            log(f"ERROR: run failed latest={json.dumps(latest)[:500]}")
            return 1
        time.sleep(POLL_SEC)

    video = http_json("GET", f"/projects/{PROJECT_ID}/video")
    assert isinstance(video, dict)
    url = video.get("downloadUrl") or video.get("download_url")
    dur = video.get("durationSec") or video.get("duration_sec")
    log(f"video artifact durationSec={dur} url_present={bool(url)}")
    if not url:
        log("ERROR: no downloadUrl")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_MP4.exists():
        OUT_MP4.unlink()
    req = urllib.request.Request(str(url))
    with urllib.request.urlopen(req, timeout=600) as res, OUT_MP4.open("wb") as out:
        while True:
            chunk = res.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)

    size = OUT_MP4.stat().st_size
    log(f"PASS wrote {OUT_MP4} bytes={size} elapsed={int(time.time() - t0)}s")
    if size < 100_000:
        log("ERROR: MP4 suspiciously small")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
