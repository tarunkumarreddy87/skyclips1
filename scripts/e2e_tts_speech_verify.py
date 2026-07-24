#!/usr/bin/env python3
"""Short E2E: prove real TTS speech is present (not silent WAV)."""

from __future__ import annotations

import functools
import json
import math
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave
from pathlib import Path

API = "http://127.0.0.1:8000"
print = functools.partial(print, flush=True)  # type: ignore[assignment]


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = None
    headers = {"Content-Type": "application/json", "X-User-External-Id": "dev-local-user"}
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def wait_run(project_id: str, timeout_sec: int, label: str) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        run = api("GET", f"/projects/{project_id}/runs/latest")
        status = (run or {}).get("status")
        stage = (run or {}).get("currentStage")
        err = (run or {}).get("errorMessage")
        print(f"[{label}] status={status} stage={stage} err={err}")
        if status == "completed":
            return run
        if status == "failed":
            raise RuntimeError(f"{label} failed: {json.dumps(run, indent=2)}")
        time.sleep(10)
    raise TimeoutError(f"{label} timed out after {timeout_sec}s")


def audio_has_speech(path: Path, *, min_peak: int = 500, min_rms: float = 40.0) -> tuple[bool, float, float, float]:
    """Extract mono PCM via ffmpeg and measure peak/RMS."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-ac",
                "1",
                "-ar",
                "22050",
                "-t",
                "120",
                str(wav_path),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with wave.open(str(wav_path), "rb") as wf:
            raw = wf.readframes(min(wf.getnframes(), wf.getframerate() * 120))
            rate = wf.getframerate()
        samples = struct.unpack("<" + "h" * (len(raw) // 2), raw[: (len(raw) // 2) * 2])
        if not samples:
            return False, 0.0, 0.0, 0.0
        peak = float(max(abs(s) for s in samples))
        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
        dur = len(samples) / float(rate)
        return peak >= min_peak and rms >= min_rms, peak, rms, dur
    finally:
        wav_path.unlink(missing_ok=True)


def main() -> int:
    minutes = 2
    prompt = (
        f"Create a {minutes} minute documentary about coral reef bleaching. "
        "Explain what coral polyps are, why warming oceans cause bleaching, "
        "and one concrete conservation example. "
        "Thanks for watching — subscribe for more ocean stories."
    )

    print("=== Create project ===")
    project = api(
        "POST",
        "/projects",
        {
            "title": "E2E TTS Speech Verify 2min",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": prompt,
            "targetDurationSec": minutes * 60,
            "language": "en",
        },
    )
    project_id = project["id"]
    print(f"project_id={project_id}")

    print("=== Quote + force duration ===")
    quote = api("POST", f"/projects/{project_id}/quote")
    api(
        "PATCH",
        f"/projects/{project_id}/quote",
        {"durationSec": minutes * 60, "formatMode": "documentary"},
    )
    print(f"quote_id={quote['id']} durationSec={quote['durationSec']}")

    print("=== Approve + generate ===")
    api("POST", f"/projects/{project_id}/approve")
    gen = api("POST", f"/projects/{project_id}/generate")
    print(f"run_id={gen['run']['id']}")
    wait_run(project_id, 45 * 60, "generate")

    print("=== Render ===")
    api("POST", f"/projects/{project_id}/render", {})
    wait_run(project_id, 30 * 60, "render")

    print("=== Download + speech check ===")
    video_meta = api("GET", f"/projects/{project_id}/video")
    url = video_meta.get("downloadUrl") or video_meta.get("url")
    out = Path("d:\\HANUMAN\\scripts\\e2e_tts_speech_verify.mp4")
    urllib.request.urlretrieve(url, out)
    ok, peak, rms, dur = audio_has_speech(out)
    print(f"output={out}")
    print(f"audio_sample_dur={dur:.2f}s peak={peak:.0f} rms={rms:.1f} HAS_SPEECH={ok}")
    if not ok:
        print("FAIL: output audio looks silent / near-silent", file=sys.stderr)
        return 1
    print("PASS: real speech energy detected in rendered video")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
