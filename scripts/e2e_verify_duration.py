#!/usr/bin/env python3
"""End-to-end duration verification: create project, quote, generate, render, measure."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
import functools
from pathlib import Path

API = "http://127.0.0.1:8000"
POLL_SEC = 15
GENERATE_TIMEOUT_SEC = 3 * 60 * 60  # 3h for long scripts + TTS
RENDER_TIMEOUT_SEC = 2 * 60 * 60

# Always flush logs so long runs show progress.
print = functools.partial(print, flush=True)  # type: ignore[assignment]


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = None
    headers = {"Content-Type": "application/json", "X-User-External-Id": "dev-local-user"}
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    )
    return float(out.strip())


def wait_run(project_id: str, timeout_sec: int, label: str) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        run = api("GET", f"/projects/{project_id}/runs/latest")
        status = (run or {}).get("status")
        stage = (run or {}).get("currentStage")
        print(f"[{label}] status={status} stage={stage}")
        if status == "completed":
            return run
        if status == "failed":
            raise RuntimeError(f"{label} failed: {run}")
        time.sleep(POLL_SEC)
    raise TimeoutError(f"{label} timed out after {timeout_sec}s")


def main() -> int:
    minutes = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    prompt = (
        f"Create a {minutes} mins documentary about the history of coral reefs and climate change. "
        "Include the science, the political stakes, and concrete examples. "
        "Thanks for watching — subscribe for more ocean stories."
    )

    print("=== Step 1: Create project ===")
    project = api(
        "POST",
        "/projects",
        {
            "title": f"E2E Duration Verify {minutes}min",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": prompt,
            "language": "en",
        },
    )
    project_id = project["id"]
    print(f"project_id={project_id}")

    print("=== Step 2: Generate quote ===")
    quote = api("POST", f"/projects/{project_id}/quote")
    duration_sec = int(quote["durationSec"])
    print(f"QUOTE durationSec={duration_sec} ({duration_sec / 60:.2f} min)")
    expected = minutes * 60
    if abs(duration_sec - expected) > 60:
        print(
            f"WARNING: quote duration {duration_sec}s differs from expected {expected}s by >60s",
            file=sys.stderr,
        )

    print("=== Step 3: Approve quote ===")
    api("POST", f"/projects/{project_id}/approve")

    print("=== Step 4: Generate (may take a while) ===")
    gen = api("POST", f"/projects/{project_id}/generate")
    print(f"run_id={gen['run']['id']}")
    wait_run(project_id, GENERATE_TIMEOUT_SEC, "generate")

    print("=== Step 5: Render ===")
    api("POST", f"/projects/{project_id}/render", {})
    wait_run(project_id, RENDER_TIMEOUT_SEC, "render")

    print("=== Step 6: Download + measure ===")
    video_meta = api("GET", f"/projects/{project_id}/video")
    url = video_meta.get("downloadUrl") or video_meta.get("url")
    if not url:
        raise RuntimeError(f"No video URL in response: {video_meta}")

    out = Path("d:\\HANUMAN\\scripts\\e2e_duration_verify.mp4")
    urllib.request.urlretrieve(url, out)
    actual = ffprobe_duration(out)
    requested = float(duration_sec)
    delta = actual - requested

    print("=== RESULTS ===")
    print(f"Requested (quote): {requested:.3f}s ({requested / 60:.2f} min)")
    print(f"Actual (ffprobe):  {actual:.3f}s ({actual / 60:.2f} min)")
    print(f"Delta:             {delta:+.3f}s ({delta / 60:+.2f} min)")
    print(f"Output file:       {out}")
    print(f"Project id:        {project_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
