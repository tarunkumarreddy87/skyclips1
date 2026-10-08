"""Native equivalents of the editor's shared filter catalog and effect controls."""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def catalog() -> dict:
    path = Path(__file__).resolve().parents[4] / "packages/shared-types/src/visual-filters.json"
    return {item["id"]: item for item in json.loads(path.read_text(encoding="utf-8"))}


def visual_filter(effects: dict | None, width: int, height: int, fps: int) -> str:
    if not effects:
        return ""
    style = catalog().get(effects.get("filterId"), catalog()["none"])
    strength = min(1, max(0, float(effects.get("strength", 1))))
    blend = lambda name: 1 + (style[name] - 1) * strength
    brightness = blend("brightness") * float(effects.get("brightness", 1))
    contrast = blend("contrast") * float(effects.get("contrast", 1))
    saturation = blend("saturation") * float(effects.get("saturation", 1))
    parts = ["format=rgba"]
    # CSS applies brightness, contrast, saturation, sepia, then hue rotation.
    parts.append("lutrgb=" + ":".join(f"{c}='clip((val*{brightness:.8f}-127.5)*{contrast:.8f}+127.5,0,255)'" for c in "rgb"))
    weights = [.213, .715, .072]
    matrix = [[weights[j] * (1 - saturation) + (saturation if i == j else 0) for j in range(3)] for i in range(3)]
    sepia = style["sepia"] * strength
    sepia_matrix = [[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]]
    sepia_matrix = [[(1 - sepia if i == j else 0) + sepia * sepia_matrix[i][j] for j in range(3)] for i in range(3)]
    angle = math.radians(style["hue"] * strength)
    co, si = math.cos(angle), math.sin(angle)
    hue = [[.213+.787*co-.213*si, .715-.715*co-.715*si, .072-.072*co+.928*si],
           [.213-.213*co+.143*si, .715+.285*co+.140*si, .072-.072*co-.283*si],
           [.213-.213*co-.787*si, .715-.715*co+.715*si, .072+.928*co+.072*si]]
    multiply = lambda a, b: [[sum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    matrix = multiply(hue, multiply(sepia_matrix, matrix))
    parts.append("colorchannelmixer=" + ":".join(f"{a}{b}={matrix[i][j]:.8f}" for i,a in enumerate("rgb") for j,b in enumerate("rgb")))
    amount = min(1, max(0, float(effects.get("effectStrength", 1))))
    effect = effects.get("effectId")
    if effect == "soft-focus":
        parts.append(f"gblur=sigma={4 * amount:.4f}")
    elif effect == "vignette":
        parts.append(f"vignette=angle={amount * math.pi / 4:.6f}")
    elif effect == "chromatic":
        parts.append(f"rgbashift=rh={round(6*amount)}:bh={-round(6*amount)}")
    elif effect == "scanlines":
        parts.append("drawgrid=width=iw:height=5:thickness=1:color=black@" + f"{.45 * amount:.5f}")
    elif effect == "flicker":
        parts.append(f"eq=brightness='-{amount*.15:.6f}*(1+sin(n*1.73))':eval=frame")
    elif effect in ("pulse", "handheld"):
        # Zoompan emits one frame per input; its clock matches preview's clip-local clock.
        zoom = f"1+(1+sin(on/{fps}*2*PI))*{.04*amount:.6f}" if effect == "pulse" else "1.04"
        x = "iw/2-iw/zoom/2"
        y = "ih/2-ih/zoom/2"
        if effect == "handheld":
            x += f"-sin(on*.73)*iw*{amount*.014:.6f}"
            y += f"-cos(on*.91)*ih*{amount*.01:.6f}"
        parts.append(f"zoompan=z='{zoom}':x='{x}':y='{y}':d=1:s={width}x{height}:fps={fps}")
    return ",".join(parts)
