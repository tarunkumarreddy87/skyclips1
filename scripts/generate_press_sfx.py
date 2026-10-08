"""Rebuild SkyClip's original press-cutout sound set, without external samples.

48 kHz stereo PCM; seeded noise, filtered friction, paper grains and soft tonal
accents. Individual files peak at -7 dBFS; template gains and the global SFX bus
leave room for narration. Run from any directory with Python 3.11+.
"""

from __future__ import annotations

from array import array
from math import cos, exp, pi, sin, sqrt
from pathlib import Path
import random
import sys
import wave


RATE = 48_000
ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "apps/web/public/sfx"
DURATIONS = {
    "paper": .8, "impact": 1.1, "marker": .62, "whoosh": .76,
    "pencil": .9, "rise": 1.6, "exit": .55,
}


def smooth_window(time: float, start: float, duration: float) -> float:
    progress = (time - start) / duration
    return sin(pi * progress) ** 2 if 0 < progress < 1 else 0.0


def generate(kind: str, duration: float, seed: int) -> list[tuple[float, float]]:
    random_source = random.Random(seed)
    low = body = rumble = phase = 0.0
    signal: list[tuple[float, float]] = []
    for index in range(round(duration * RATE)):
        time = index / RATE
        progress = time / duration
        noise = random_source.uniform(-1, 1)
        # Three lowpasses isolate soft air, midrange fibre and paper body.
        cutoff = (900 + 3600 * sin(pi * progress)) if kind in {"whoosh", "exit", "rise"} else 3600
        low += (1 - exp(-2 * pi * cutoff / RATE)) * (noise - low)
        body += (1 - exp(-2 * pi * 580 / RATE)) * (noise - body)
        rumble += (1 - exp(-2 * pi * 110 / RATE)) * (noise - rumble)
        fibre = low - body
        if kind == "paper":
            folds = sum(smooth_window(time, start, length) * strength
                        for start, length, strength in [(0, .36, .65), (.12, .28, .44), (.30, .40, .3), (.57, .16, .12)])
            grain = .7 + .3 * sin(2 * pi * 37 * time + sin(2 * pi * 9 * time))
            value = folds * (fibre * .8 * grain + body * .28)
        elif kind == "impact":
            # A felt desk/paper landing with a rounded low-end, not a hard hit.
            phase += 2 * pi * (54 + 52 * exp(-time * 16)) / RATE
            onset = min(1, time / .012)
            value = onset * (.42 * sin(phase) * exp(-time * 8.8)
                             + .44 * body * exp(-time * 22)
                             + .10 * fibre * exp(-time * 35))
        elif kind == "marker":
            draw = smooth_window(time, .01, .56) ** .65
            pressure = .7 + .18 * sin(2 * pi * 17 * time) + .12 * sin(2 * pi * 31 * time)
            value = draw * (fibre * .52 * pressure + body * .16)
        elif kind == "pencil":
            strokes = sum(smooth_window(time, start, length)
                          for start, length in [(.01, .19), (.24, .27), (.55, .29)])
            pressure = .68 + .32 * sin(2 * pi * 69 * time + sin(2 * pi * 13 * time))
            value = strokes * (fibre * .40 * pressure + .10 * body)
        elif kind == "rise":
            phase += 2 * pi * (95 + 115 * progress ** 1.4) / RATE
            swell = sin(pi * progress) ** 1.8
            value = swell * (.22 * (low - rumble) + .055 * sin(phase))
        else:
            # A directional paper pass; the exit is shorter and brighter.
            swell = sin(pi * progress) ** (2.4 if kind == "whoosh" else 1.8)
            flutter = .86 + .14 * sin(2 * pi * 24 * time)
            value = swell * ((low - rumble) * .58 + body * .20) * flutter
        # Cosine fades ensure silent endpoints even when a grain ends early.
        fade_in = (1 - cos(pi * min(1, time / .006))) / 2
        fade_out = (1 - cos(pi * min(1, (duration - 1 / RATE - time) / .025))) / 2
        value *= fade_in * fade_out
        pan = .22 * (2 * progress - 1) if kind in {"paper", "marker", "whoosh", "exit"} else .06 * sin(2 * pi * progress)
        signal.append((value * sqrt((1 - pan) / 2), value * sqrt((1 + pan) / 2)))
    return signal


def write_wave(kind: str, duration: float, seed: int) -> tuple[Path, float]:
    frames = generate(kind, duration, seed)
    peak = max(abs(sample) for frame in frames for sample in frame)
    scale = 10 ** (-7 / 20) / peak
    pcm = array("h", (round(sample * scale * 32767) for frame in frames for sample in frame))
    if sys.byteorder != "little":
        pcm.byteswap()
    path = DESTINATION / f"motion-press-{kind}.wav"
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    rms = sqrt(sum((sample * scale) ** 2 for frame in frames for sample in frame) / (len(frames) * 2))
    return path, rms


if __name__ == "__main__":
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for index, (kind, duration) in enumerate(DURATIONS.items()):
        path, rms = write_wave(kind, duration, 5272026 + index)
        print(f"{path.name}: {duration:.2f}s stereo 48kHz, peak -7 dBFS, RMS {rms:.4f}")
