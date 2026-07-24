#!/usr/bin/env python3
"""10-minute E2E: create → quote(600s) → generate → render → duration/speech checks."""

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
OUT_DIR = Path("d:/HANUMAN/scripts/_e2e_10min")
OUT_MP4 = OUT_DIR / "final.mp4"
REPORT = OUT_DIR / "report.json"
print = functools.partial(print, flush=True)  # type: ignore[assignment]


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = None
    headers = {"Content-Type": "application/json", "X-User-External-Id": "dev-local-user"}
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode())


def wait_run(project_id: str, timeout_sec: int, label: str) -> dict:
    deadline = time.time() + timeout_sec
    last = ""
    while time.time() < deadline:
        run = api("GET", f"/projects/{project_id}/runs/latest")
        status = (run or {}).get("status")
        stage = (run or {}).get("currentStage")
        err = (run or {}).get("errorMessage")
        line = f"[{label}] status={status} stage={stage} err={err}"
        if line != last:
            print(line)
            last = line
        if status == "completed":
            return run
        if status == "failed":
            raise RuntimeError(f"{label} failed: {json.dumps(run, indent=2)}")
        time.sleep(20)
    raise TimeoutError(f"{label} timed out after {timeout_sec}s")


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


def extract_wav_window(mp4: Path, start: float, dur: float, out: Path) -> None:
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{dur:.3f}",
            "-i",
            str(mp4),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(out),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wav_stats(path: Path) -> dict:
    with wave.open(str(path), "rb") as wf:
        raw = wf.readframes(wf.getnframes())
        n = len(raw) // 2
        samples = struct.unpack("<" + "h" * n, raw[: n * 2]) if n else ()
    if not samples:
        return {"peak": 0, "rms": 0.0}
    peak = max(abs(s) for s in samples)
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    return {"peak": peak, "rms": rms}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    minutes = 10
    target = minutes * 60
    prompt = (
        f"Create a {minutes} minute history documentary about Indian freedom fighters. "
        "Cover early resistance, 1857, revolutionary movements, Gandhi-era mass struggle, "
        "and independence. End with: Thanks for watching — subscribe for more history."
    )

    print("=== Create project ===")
    project = api(
        "POST",
        "/projects",
        {
            "title": "E2E 10min Indian Fighters",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": prompt,
            "targetDurationSec": target,
            "language": "en",
            "brandProfileId": "history",
        },
    )
    project_id = project["id"]
    print(f"project_id={project_id}")

    print("=== Quote + force 10:00 ===")
    api("POST", f"/projects/{project_id}/quote")
    quote = api(
        "PATCH",
        f"/projects/{project_id}/quote",
        {"durationSec": target, "formatMode": "documentary", "brandProfileId": "history"},
    )
    print(f"quote durationSec={quote.get('durationSec')} brand={quote.get('brandProfileId')}")

    print("=== Approve + generate ===")
    api("POST", f"/projects/{project_id}/approve")
    gen = api("POST", f"/projects/{project_id}/generate")
    run_id = gen["run"]["id"]
    print(f"run_id={run_id}")
    wait_run(project_id, 3 * 60 * 60, "generate")

    print("=== Inspect timeline ===")
    timeline = api("GET", f"/projects/{project_id}/timeline")
    manifest = timeline["manifest"]
    duration = float(manifest["metadata"]["duration_sec"])
    tracks = manifest.get("tracks") or {}
    lane_report = {
        "duration_sec": duration,
        "video_clips": len(tracks.get("video") or []),
        "caption_clips": len(tracks.get("captions") or []),
        "broll_clips": len(tracks.get("broll") or []),
        "music_clips": len(tracks.get("music") or []),
        "transitions": len(manifest.get("transitions") or []),
    }
    print(json.dumps(lane_report, indent=2))

    # Allow ~8% underfill from TTS pacing vs script estimate.
    min_ok = target * 0.85
    assert duration >= min_ok, f"timeline duration {duration}s < {min_ok}s"

    print("=== Render ===")
    api("POST", f"/projects/{project_id}/render", {})
    wait_run(project_id, 2 * 60 * 60, "render")

    print("=== Download ===")
    video_meta = api("GET", f"/projects/{project_id}/video")
    url = video_meta.get("downloadUrl") or video_meta.get("url")
    if not url:
        raise RuntimeError(f"No video URL: {video_meta}")
    urllib.request.urlretrieve(url, OUT_MP4)
    actual = ffprobe_duration(OUT_MP4)
    print(f"ffprobe duration={actual:.2f}s ({actual/60:.2f} min)")

    mix_wav = OUT_DIR / "mix_60s.wav"
    extract_wav_window(OUT_MP4, 30.0, 60.0, mix_wav)
    mix = wav_stats(mix_wav)
    speech_ok = mix["peak"] >= 500 and mix["rms"] >= 40

    report = {
        "project_id": project_id,
        "run_id": run_id,
        "output": str(OUT_MP4),
        "lane_report": lane_report,
        "ffprobe_duration_sec": actual,
        "audio": mix,
        "speech_present": speech_ok,
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"report={REPORT}")

    fails = []
    if actual < min_ok:
        fails.append(f"rendered duration {actual:.1f}s < {min_ok:.0f}s")
    if not speech_ok:
        fails.append("narration not audible")
    if fails:
        print("FAIL: " + "; ".join(fails), file=sys.stderr)
        return 1
    print(f"PASS: 10-min E2E ok duration={actual/60:.2f}min speech=yes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
