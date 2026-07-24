#!/usr/bin/env python3
"""Script-first 8+ min E2E with fixed English narration (avoids free-model TTS language failures)."""

from __future__ import annotations

import functools
import json
import math
import struct
import subprocess
import sys
import time
import urllib.request
import wave
from pathlib import Path

API = "http://127.0.0.1:8000"
OUT = Path("d:/HANUMAN/scripts/_e2e_lanes_8min_scriptfirst")
print = functools.partial(print, flush=True)  # type: ignore[assignment]

# ~8 minutes at ~145 wpm ≈ 1160 words. Pure English for Sarvam.
SCRIPT = """
Introduction

The twentieth century was forged in fire. Two world wars redrew borders, toppled empires, and remade the balance of power across every ocean. This is the story of how those conflicts reshaped the modern world, from the trenches of Europe to the factories of America, and from the eastern front to the conference tables that followed.

The Road to Global War

In the years after the First World War, fragile peace rested on treaties that satisfied almost no one. Economic collapse, nationalist anger, and authoritarian ambition pushed continents toward another catastrophe. Leaders spoke of security while preparing for conquest. Ordinary families felt the ground shift beneath them long before the first bombs fell.

The Eastern Front

When war exploded across Europe again, the eastern front became a theater of almost unimaginable scale. Armies measured progress in vast distances, and civilian suffering followed every advance and retreat. Cities burned. Rail lines became lifelines and targets. The struggle here was not only military; it was a contest over who would define the political future of an entire region.

The Arsenal of Democracy

Across the Atlantic, industrial power turned into wartime strength. Shipyards, aircraft plants, and assembly lines became an arsenal of democracy, sending food, fuel, steel, and machines to allies under relentless pressure. Workers, including millions of women entering factories in new roles, kept production moving day and night. Logistics mattered as much as courage: without ships and trucks and spare parts, even the bravest armies would stall.

The Battle for the Seas and Skies

Control of the oceans decided whether factories could feed fronts. Convoys crossed dangerous waters under submarine threat, while air power grew from reconnaissance tool to strategic weapon. Bombing campaigns aimed to break industrial capacity and morale, with controversial results that historians still debate. Technology accelerated under wartime urgency: radar, codebreaking, and improved aircraft changed what commanders could know and when they could act.

Turning Points

No single day ended the war, but several campaigns shifted momentum. Counteroffensives on the eastern front bled invading armies. In the west, amphibious landings opened a second major path into occupied Europe. In the Pacific, island campaigns forced a grinding advance toward the Japanese home islands. Each turning point carried a human cost that statistics can only dimly convey.

Occupation and Resistance

Behind the front lines, occupied societies faced hunger, surveillance, and terror. Resistance movements sabotaged rail lines, gathered intelligence, and kept hope alive at extraordinary personal risk. Collaboration also existed, reminding us that occupation politics were never simple. The war was fought in kitchens and basements as well as on battlefields.

The Politics of Alliance

Alliances held under strain. Shared enemies did not erase conflicting postwar ambitions. Conferences among major powers sketched a future map before victory was secure. Questions of spheres of influence, reparations, and security guarantees already pointed toward a colder peace. Wartime partnership was real, and so were the cracks forming underneath it.

Liberation and Reckoning

As armies advanced, liberation revealed crimes that shocked the world. Evidence of mass murder and systematic atrocity forced a moral reckoning that would shape trials, laws, and memory for generations. Survivors asked for justice and for truth. Societies had to decide what to remember, what to teach, and how to prevent such horror again.

The Postwar Order

Victory did not restore the old world. Empires weakened. New institutions for collective security and economic recovery took shape. The United States and the Soviet Union emerged as rival poles of power, and former allies became competitors. Borders changed. Millions were displaced. The Cold War grew out of wartime outcomes as much as postwar ideology.

Technology, Economy, and Everyday Life

War accelerated science and industry, from medicine to computing to aviation. Peacetime economies inherited wartime factories and skills, but also debt and trauma. Families rebuilt homes while newspapers described a new nuclear age. The private lives of survivors remained marked by absence, injury, and silence that public monuments could never fully express.

Why This History Still Matters

Understanding these wars is not antiquarian curiosity. The institutions, alliances, and rivalries of today still carry the imprint of decisions made under fire. Memory can be manipulated; history demands evidence. When we study the eastern front, the arsenal of democracy, and the political aftermath together, we see how military events and political choices were always intertwined.

Conclusion and Sign-Off

The world that emerged from the world wars was more connected, more powerful, and more precarious. Peace required institutions, restraint, and vigilance, not only treaties on paper. Thanks for watching — subscribe for more history.
""".strip()


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
        print(f"[{label}] status={run.get('status')} stage={run.get('currentStage')} err={run.get('errorMessage')}")
        if run.get("status") == "completed":
            return run
        if run.get("status") == "failed":
            raise RuntimeError(json.dumps(run, indent=2))
        time.sleep(15)
    raise TimeoutError(label)


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
    )
    return float(out.strip())


def extract_frame(mp4: Path, at_sec: float, out: Path) -> None:
    subprocess.check_call(
        ["ffmpeg", "-y", "-ss", f"{at_sec:.3f}", "-i", str(mp4), "-frames:v", "1", "-q:v", "2", str(out)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def wav_stats(path: Path) -> tuple[float, float]:
    with wave.open(str(path), "rb") as wf:
        raw = wf.readframes(wf.getnframes())
    samples = struct.unpack("<" + "h" * (len(raw) // 2), raw[: (len(raw) // 2) * 2])
    if not samples:
        return 0.0, 0.0
    peak = float(max(abs(s) for s in samples))
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    return peak, rms


def band_rms(src: Path, af: str) -> float:
    tmp = OUT / "_band.wav"
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", str(src), "-af", af, str(tmp)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    _, rms = wav_stats(tmp)
    tmp.unlink(missing_ok=True)
    return rms


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    words = len(SCRIPT.split())
    print(f"script_words={words}")

    print("=== Create script_first project ===")
    project = api(
        "POST",
        "/projects",
        {
            "title": "E2E Lanes ScriptFirst 8min",
            "entryPath": "script_first",
            "formatMode": "documentary",
            "scriptText": SCRIPT,
            "targetDurationSec": 8 * 60,
            "language": "en",
        },
    )
    project_id = project["id"]
    print(f"project_id={project_id}")

    quote = api("POST", f"/projects/{project_id}/quote")
    quote = api("PATCH", f"/projects/{project_id}/quote", {"durationSec": 8 * 60, "formatMode": "documentary"})
    print(f"quote durationSec={quote.get('durationSec')}")
    api("POST", f"/projects/{project_id}/approve")
    gen = api("POST", f"/projects/{project_id}/generate")
    print(f"run_id={gen['run']['id']}")
    wait_run(project_id, 3 * 3600, "generate")

    tl = api("GET", f"/projects/{project_id}/timeline")
    m = tl["manifest"]
    tracks = m["tracks"]
    overlays = m.get("overlays") or []
    duration = float(m["metadata"]["duration_sec"])
    caps = tracks.get("captions") or []
    broll = tracks.get("broll") or []
    music = tracks.get("music") or []
    chapter = [o for o in overlays if o.get("type") == "chapter_title"]
    cta = [o for o in overlays if o.get("type") == "subscribe_cta"]
    lane = {
        "duration_sec": duration,
        "captions": len(caps),
        "caption_max_len": max((len(c.get("text") or "") for c in caps), default=0),
        "broll": len(broll),
        "music": len(music),
        "music_mood": music[0].get("mood") if music else None,
        "chapter": len(chapter),
        "cta": len(cta),
        "transitions": len(m.get("transitions") or []),
    }
    print(json.dumps(lane, indent=2))
    if duration < 7 * 60:
        print(f"WARNING: duration {duration:.1f}s < 7min (script may be short for TTS pacing)", file=sys.stderr)

    print("=== Render ===")
    api("POST", f"/projects/{project_id}/render", {})
    wait_run(project_id, 2 * 3600, "render")

    meta = api("GET", f"/projects/{project_id}/video")
    url = meta.get("downloadUrl") or meta.get("url")
    mp4 = OUT / "final.mp4"
    urllib.request.urlretrieve(url, mp4)
    actual = ffprobe_duration(mp4)
    print(f"ffprobe={actual:.2f}s ({actual/60:.2f} min)")

    samples = {
        "t30": 30.0,
        "t120": min(120.0, actual - 2),
        "t240": min(240.0, actual - 2),
        "near_end": max(1.0, actual - 6),
    }
    if chapter:
        samples["chapter"] = float(chapter[0]["start_sec"]) + 0.8
    if broll:
        samples["broll"] = float(broll[0]["start_sec"]) + 1.0
    if cta:
        samples["cta"] = float(cta[0]["start_sec"]) + 0.5
    if caps:
        samples["caption"] = float(caps[min(8, len(caps) - 1)]["start_sec"]) + 0.3

    frames = {}
    for name, t in samples.items():
        if t >= actual:
            continue
        path = OUT / f"frame_{name}.jpg"
        extract_frame(mp4, t, path)
        frames[name] = str(path)
        print(f"frame {name}@{t:.1f}s")

    mix = OUT / "mix_60s.wav"
    subprocess.check_call(
        ["ffmpeg", "-y", "-ss", "25", "-t", "60", "-i", str(mp4), "-ac", "1", "-ar", "22050", str(mix)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    peak, rms = wav_stats(mix)
    hp = band_rms(mix, "highpass=f=800")
    lp = band_rms(mix, "lowpass=f=400")
    audio = {
        "peak": peak,
        "rms": rms,
        "hp": hp,
        "lp": lp,
        "speech": peak >= 500 and rms >= 40,
        "bed": lp >= 15,
        "bed_under_narration": hp > lp * 0.55,
    }
    print(json.dumps(audio, indent=2))

    report = {
        "project_id": project_id,
        "output": str(mp4),
        "lane": lane,
        "ffprobe_duration_sec": actual,
        "frames": frames,
        "audio": audio,
        "licensing": "PRE-LAUNCH: synth beds kept for now — not a solved licensed music library.",
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"report={OUT / 'report.json'}")

    fails = []
    if actual < 7 * 60:
        fails.append(f"duration {actual:.1f}s < 7min")
    if not audio["speech"]:
        fails.append("narration not audible")
    if not audio["bed"]:
        fails.append("synth bed low-band energy missing")
    if lane["broll"] < 1:
        fails.append("no broll")
    if lane["music"] < 1:
        fails.append("no music")
    if lane["chapter"] + lane["cta"] < 1:
        fails.append("no motion overlays")
    if lane["caption_max_len"] > 120:
        fails.append("captions too long")
    if fails:
        print("FAIL: " + "; ".join(fails), file=sys.stderr)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
