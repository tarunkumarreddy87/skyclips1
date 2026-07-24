#!/usr/bin/env python3
"""Fresh 7+ min E2E: generate → inspect timeline lanes → render → verify output."""

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
OUT_DIR = Path("d:/HANUMAN/scripts/_e2e_lanes_8min")
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
        time.sleep(15)
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


def extract_frame(mp4: Path, at_sec: float, out: Path) -> None:
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{at_sec:.3f}",
            "-i",
            str(mp4),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


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
            "22050",
            str(out),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wav_stats(path: Path) -> dict:
    with wave.open(str(path), "rb") as wf:
        raw = wf.readframes(wf.getnframes())
        rate = wf.getframerate()
    samples = struct.unpack("<" + "h" * (len(raw) // 2), raw[: (len(raw) // 2) * 2])
    if not samples:
        return {"peak": 0.0, "rms": 0.0, "dur": 0.0}
    peak = float(max(abs(s) for s in samples))
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    # Spectral centroid proxy via zero-crossing rate (speech higher than soft pad)
    zc = 0
    for i in range(1, len(samples)):
        if (samples[i - 1] >= 0) != (samples[i] >= 0):
            zc += 1
    zcr = zc / max(1, len(samples) - 1)
    return {"peak": peak, "rms": rms, "dur": len(samples) / float(rate), "zcr": zcr}


def highpass_rms(path: Path, cutoff_hz: float = 800.0) -> float:
    """RMS after high-pass — speech energy tends to survive; soft sine beds less so."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        filtered = Path(tmp.name)
    try:
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-af",
                f"highpass=f={cutoff_hz}",
                str(filtered),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return wav_stats(filtered)["rms"]
    finally:
        filtered.unlink(missing_ok=True)


def lowpass_rms(path: Path, cutoff_hz: float = 400.0) -> float:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        filtered = Path(tmp.name)
    try:
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-af",
                f"lowpass=f={cutoff_hz}",
                str(filtered),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return wav_stats(filtered)["rms"]
    finally:
        filtered.unlink(missing_ok=True)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    minutes = 8
    prompt = (
        f"Create an {minutes} minute documentary about the history of the world wars "
        "and how they reshaped global power. Cover the eastern front, the arsenal of democracy, "
        "and the political aftermath. End with: Thanks for watching — subscribe for more history."
    )

    print("=== Create project ===")
    project = api(
        "POST",
        "/projects",
        {
            "title": "E2E Lanes Verify 8min",
            "entryPath": "prompt_first",
            "formatMode": "documentary",
            "promptText": prompt,
            "targetDurationSec": minutes * 60,
            "language": "en",
        },
    )
    project_id = project["id"]
    print(f"project_id={project_id}")

    print("=== Quote + force 8:00 ===")
    quote = api("POST", f"/projects/{project_id}/quote")
    quote = api(
        "PATCH",
        f"/projects/{project_id}/quote",
        {"durationSec": minutes * 60, "formatMode": "documentary"},
    )
    print(f"quote durationSec={quote.get('durationSec')}")

    print("=== Approve + generate ===")
    api("POST", f"/projects/{project_id}/approve")
    gen = api("POST", f"/projects/{project_id}/generate")
    run_id = gen["run"]["id"]
    print(f"run_id={run_id}")
    wait_run(project_id, 3 * 60 * 60, "generate")

    print("=== Inspect timeline lanes ===")
    timeline = api("GET", f"/projects/{project_id}/timeline")
    manifest = timeline["manifest"]
    tracks = manifest.get("tracks") or {}
    overlays = manifest.get("overlays") or []
    settings = manifest.get("settings") or {}
    duration = float(manifest["metadata"]["duration_sec"])

    captions = tracks.get("captions") or []
    broll = tracks.get("broll") or []
    music = tracks.get("music") or []
    video = tracks.get("video") or []
    chapter = [o for o in overlays if o.get("type") == "chapter_title"]
    cta = [o for o in overlays if o.get("type") == "subscribe_cta"]

    lane_report = {
        "duration_sec": duration,
        "video_clips": len(video),
        "caption_clips": len(captions),
        "caption_max_len": max((len(c.get("text") or "") for c in captions), default=0),
        "broll_clips": len(broll),
        "music_clips": len(music),
        "music_mood": (music[0].get("mood") if music else None),
        "music_volume": settings.get("music_volume"),
        "chapter_overlays": len(chapter),
        "subscribe_cta": len(cta),
        "transitions": len(manifest.get("transitions") or []),
    }
    print(json.dumps(lane_report, indent=2))

    assert duration >= 7 * 60, f"duration {duration}s < 7min"
    assert len(captions) >= 5, "expected chunked captions"
    assert lane_report["caption_max_len"] <= 120, "caption chunks still too long"
    assert len(broll) >= 1, "broll lane empty"
    assert len(music) >= 1, "music lane empty"
    assert len(chapter) >= 1 or len(cta) >= 1, "motion overlays empty"

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

    # Sample frames: early caption, mid broll window, chapter if any, late CTA
    samples = {
        "t30_caption": 30.0,
        "t120_mid": 120.0,
        "t240_mid": 240.0,
        "t_near_end": max(5.0, actual - 8.0),
    }
    if chapter:
        samples["chapter"] = float(chapter[0]["start_sec"]) + 0.8
    if broll:
        samples["broll"] = float(broll[0]["start_sec"]) + min(1.0, float(broll[0]["duration_sec"]) / 2)
    if cta:
        samples["cta"] = float(cta[0]["start_sec"]) + 0.5

    frame_paths = {}
    for name, t in samples.items():
        if t >= actual:
            continue
        path = OUT_DIR / f"frame_{name}.jpg"
        extract_frame(OUT_MP4, t, path)
        frame_paths[name] = str(path)
        print(f"frame {name} @ {t:.1f}s -> {path.name}")

    # Audio: full mix window + compare low vs high band energy (music bed vs speech)
    mix_wav = OUT_DIR / "mix_60s.wav"
    extract_wav_window(OUT_MP4, 20.0, 60.0, mix_wav)
    mix = wav_stats(mix_wav)
    hp = highpass_rms(mix_wav, 800.0)
    lp = lowpass_rms(mix_wav, 400.0)
    audio_report = {
        "mix_peak": mix["peak"],
        "mix_rms": mix["rms"],
        "mix_zcr": mix["zcr"],
        "highpass_rms_speechish": hp,
        "lowpass_rms_bedish": lp,
        "speech_present": mix["peak"] >= 500 and mix["rms"] >= 40,
        # Soft sine bed should contribute measurable low-band energy under narration
        "bed_energy_present": lp >= 15.0,
        "bed_under_narration": hp > lp * 0.6,  # speech band still dominates
    }
    print(json.dumps(audio_report, indent=2))

    report = {
        "project_id": project_id,
        "run_id": run_id,
        "output": str(OUT_MP4),
        "lane_report": lane_report,
        "ffprobe_duration_sec": actual,
        "frames": frame_paths,
        "audio_report": audio_report,
        "licensing_note": "Synth beds (hanuman-synth-beds-v1) kept for now — PRE-LAUNCH item, not a solved licensed library.",
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"report={REPORT}")

    fails = []
    if not audio_report["speech_present"]:
        fails.append("narration not audible")
    if not audio_report["bed_energy_present"]:
        fails.append("synth bed low-band energy missing / inaudible")
    if actual < 7 * 60:
        fails.append(f"rendered duration {actual}s < 7min")
    if fails:
        print("FAIL: " + "; ".join(fails), file=sys.stderr)
        return 1
    print("PASS: lanes populated + render has speech and bed energy under narration")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
