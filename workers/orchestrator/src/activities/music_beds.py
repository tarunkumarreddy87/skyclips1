"""Library-style background music beds (synthesized, no third-party license).

These are template ambient beds matched by mood tag — not custom composition.
Replace with licensed royalty-free stems when product picks a music library.

Prefers FFmpeg lavfi (fast for long videos); falls back to a low-rate Python synth.
"""

from __future__ import annotations

import math
import re
import shutil
import struct
import subprocess
import wave
from pathlib import Path
from typing import Any

MOOD_BEDS: dict[str, dict[str, Any]] = {
    "documentary": {
        "label": "Documentary ambient",
        "freqs": (110.0, 164.8, 220.0),
        "noise": 0.012,
        "volume": 0.22,
    },
    "serious": {
        "label": "Serious low drone",
        "freqs": (82.4, 123.5, 164.8),
        "noise": 0.008,
        "volume": 0.18,
    },
    "upbeat": {
        "label": "Upbeat pulse",
        "freqs": (130.8, 196.0, 261.6),
        "noise": 0.02,
        "volume": 0.2,
    },
    "reflective": {
        "label": "Reflective pad",
        "freqs": (98.0, 146.8, 196.0),
        "noise": 0.01,
        "volume": 0.2,
    },
}

_SERIOUS_RE = re.compile(
    r"\b(war|death|crisis|tragedy|genocide|famine|disaster|atrocity|holocaust|massacre)\b",
    re.I,
)
_UPBEAT_RE = re.compile(r"\b(fun|tips|hack|amazing|celebrate|win|success|how to)\b", re.I)
_REFLECTIVE_RE = re.compile(r"\b(memory|remember|legacy|quiet|peace|reflect|soul)\b", re.I)


def pick_music_mood(format_mode: str, script: dict[str, Any] | None = None) -> str:
    """Map format + script tone keywords to a library mood tag."""
    if str(format_mode or "").lower() == "listicle":
        return "upbeat"
    text_parts: list[str] = []
    for section in (script or {}).get("sections") or []:
        text_parts.append(str(section.get("title") or ""))
        text_parts.append(str(section.get("narration") or ""))
    blob = " ".join(text_parts)
    if _SERIOUS_RE.search(blob):
        return "serious"
    if _UPBEAT_RE.search(blob):
        return "upbeat"
    if _REFLECTIVE_RE.search(blob):
        return "reflective"
    return "documentary"


def _synthesize_music_bed_ffmpeg(
    output_path: Path,
    *,
    duration_sec: float,
    mood: str,
    preset: dict[str, Any],
) -> bool:
    """Fast ambient bed via FFmpeg lavfi (seconds, not minutes of Python loops)."""
    if not shutil.which("ffmpeg"):
        return False
    duration = max(1.0, float(duration_sec))
    freqs = preset["freqs"]
    volume = float(preset["volume"])
    noise_amp = float(preset["noise"])
    fade = min(3.0, duration * 0.08)

    # Layer soft sines + quiet pink noise, then fade.
    sine_inputs: list[str] = []
    for i, f in enumerate(freqs):
        amp = (0.45 if i == 0 else 0.28) / max(1, len(freqs))
        sine_inputs.append(f"sine=frequency={f:.2f}:sample_rate=44100:duration={duration:.3f},volume={amp:.4f}[s{i}]")
    noise = f"anoisesrc=d={duration:.3f}:c=pink:r=44100:a={noise_amp:.4f}[n]"
    n_sines = len(freqs)
    labels = "".join(f"[s{i}]" for i in range(n_sines)) + "[n]"
    mix = (
        f"{labels}amix=inputs={n_sines + 1}:duration=first:normalize=0,"
        f"volume={volume:.3f},"
        f"afade=t=in:st=0:d={fade:.3f},"
        f"afade=t=out:st={max(0.0, duration - fade):.3f}:d={fade:.3f},"
        f"aformat=channel_layouts=stereo[aout]"
    )
    filter_complex = ";".join([*sine_inputs, noise, mix])
    cmd = [
        "ffmpeg",
        "-y",
        "-filter_complex",
        filter_complex,
        "-map",
        "[aout]",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return result.returncode == 0 and output_path.is_file() and output_path.stat().st_size > 1000


def synthesize_music_bed(
    output_path: Path,
    *,
    duration_sec: float,
    mood: str,
) -> dict[str, Any]:
    """Render a soft ambient stereo bed (FFmpeg preferred; Python fallback)."""
    preset = MOOD_BEDS.get(mood) or MOOD_BEDS["documentary"]
    duration = max(1.0, float(duration_sec))

    if _synthesize_music_bed_ffmpeg(output_path, duration_sec=duration, mood=mood, preset=preset):
        return {
            "mood": mood if mood in MOOD_BEDS else "documentary",
            "label": preset["label"],
            "path": str(output_path),
            "engine": "ffmpeg",
        }

    # Fallback: lower sample rate so long beds don't stall build_timeline.
    freqs = preset["freqs"]
    noise_amp = float(preset["noise"])
    volume = float(preset["volume"])
    sample_rate = 22050
    n_samples = int(duration * sample_rate)
    fade = min(3.0, duration * 0.08)
    fade_n = max(1, int(fade * sample_rate))

    frames = bytearray()
    rng = 1234567
    for i in range(n_samples):
        t = i / sample_rate
        sample = 0.0
        for fi, f in enumerate(freqs):
            amp = (0.45 if fi == 0 else 0.28) / len(freqs)
            sample += amp * math.sin(2.0 * math.pi * f * t)
        if mood == "upbeat":
            sample *= 0.85 + 0.15 * math.sin(2.0 * math.pi * 2.0 * t)
        rng = (1103515245 * rng + 12345) & 0x7FFFFFFF
        noise = ((rng / 0x7FFFFFFF) * 2.0 - 1.0) * noise_amp
        sample = (sample + noise) * volume

        if i < fade_n:
            sample *= i / fade_n
        elif i > n_samples - fade_n:
            sample *= (n_samples - i) / fade_n

        sample = max(-1.0, min(1.0, sample))
        pcm = int(sample * 32767.0)
        frames.extend(struct.pack("<hh", pcm, pcm))

    with wave.open(str(output_path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(frames))

    return {
        "mood": mood if mood in MOOD_BEDS else "documentary",
        "label": preset["label"],
        "path": str(output_path),
        "engine": "python",
    }
