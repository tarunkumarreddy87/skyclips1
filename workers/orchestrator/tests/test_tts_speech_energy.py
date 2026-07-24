"""TTS reliability helpers."""

from __future__ import annotations

import io
import math
import struct
import wave

from src.activities.pipeline import _silent_wav, _wav_has_speech_energy


def _tone_wav(duration_sec: float = 0.5, rate: int = 22050, freq: float = 440.0) -> bytes:
    nframes = int(rate * duration_sec)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        frames = bytearray()
        for i in range(nframes):
            sample = int(12000 * math.sin(2 * math.pi * freq * (i / rate)))
            frames += struct.pack("<h", sample)
        wf.writeframes(frames)
    return buf.getvalue()


def test_silent_wav_has_no_speech_energy() -> None:
    assert _wav_has_speech_energy(_silent_wav(2.0)) is False


def test_tone_wav_has_speech_energy() -> None:
    assert _wav_has_speech_energy(_tone_wav()) is True
