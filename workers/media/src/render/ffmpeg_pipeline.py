"""FFmpeg render pipeline from timeline manifest."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
import urllib.request
from urllib.parse import urlparse

from src.pipeline.storage import get_bytes, put_bytes
from src.render.motion_filters import broll_overlay_xy, build_broll_vf, build_segment_vf
from src.render.transitions import (
    chain_segments_with_clips,
    collect_transition_sfx_cues,
    concat_segments,
    synthesize_transition_whoosh,
)


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
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
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def ffmpeg_version() -> str:
    if not ffmpeg_available():
        return "not found"
    result = subprocess.run(
        ["ffmpeg", "-version"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.splitlines()[0] if result.stdout else "unknown"


def _find_timeline_schema() -> Path:
    """Locate timeline.v1.json by searching upward from this file.

    Robust to the schema living at different nesting depths in host vs. Docker
    (the old hardcoded parents[4] broke when the file layout changed).
    """
    start = Path(__file__).resolve()
    for parent in [start, *start.parents]:
        candidate = parent / "packages" / "timeline-schema" / "schema" / "timeline.v1.json"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "timeline.v1.json schema not found (searched upward from "
        f"{start}). Ensure packages/timeline-schema/schema is copied into the image."
    )


def validate_manifest(manifest: dict[str, Any]) -> None:
    """Fail fast: validate manifest schema + basic invariants."""
    from jsonschema import Draft7Validator

    schema_path = _find_timeline_schema()
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(manifest), key=lambda e: e.path)
    if errors:
        msg = "; ".join(f"{'/'.join(str(p) for p in e.path)}: {e.message}" for e in errors[:5])
        raise ValueError(f"Invalid timeline manifest: {msg}")

    duration = float(manifest["metadata"]["duration_sec"])
    if duration <= 0:
        raise ValueError("Invalid timeline duration_sec")

    video = manifest["tracks"]["video"]
    audio = manifest["tracks"]["audio"]
    if not video:
        raise ValueError("Timeline has no video clips")
    if not audio:
        raise ValueError("Timeline has no audio clips")

    # Ghost clips (empty src) — same failure mode VidRush docs call out.
    for clip in video:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost video clip {clip.get('id')}: empty src — replace or delete it")
    for clip in audio:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost audio clip {clip.get('id')}: empty src — replace or delete it")
    for clip in manifest.get("tracks", {}).get("broll") or []:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost b-roll clip {clip.get('id')}: empty src — replace or delete it")
    for clip in manifest.get("tracks", {}).get("music") or []:
        src = str(clip.get("src") or "").strip()
        if not src:
            raise ValueError(f"Ghost music/sfx clip {clip.get('id')}: empty src — replace or delete it")

    end = max(float(c["start_sec"]) + float(c["duration_sec"]) for c in video)
    clip_sum = sum(float(c["duration_sec"]) for c in video)
    transition_overlap = sum(
        float(t.get("duration_sec") or 0)
        for t in manifest.get("transitions") or []
        if t.get("enabled", True) and t.get("type") not in (None, "cut")
    )
    # Accept absolute canvas end OR TransitionSeries-compressed length (VidRush/Remotion).
    compressed = max(0.01, clip_sum - transition_overlap)
    matches_canvas = abs(end - duration) <= max(2.0, transition_overlap + 2.0)
    matches_export = abs(compressed - duration) <= 2.0
    if not matches_canvas and not matches_export:
        raise ValueError(
            f"Video end ({end:.2f}s) / compressed ({compressed:.2f}s) "
            f"does not match duration ({duration:.2f}s)"
        )


def _run_ffmpeg(cmd: list[str]) -> None:
    subprocess.run(
        cmd,
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _is_http_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def _read_source_bytes(src_key_or_url: str) -> bytes:
    if _is_http_url(src_key_or_url):
        with urllib.request.urlopen(src_key_or_url) as resp:
            return resp.read()
    local = Path(src_key_or_url)
    if local.is_file():
        return local.read_bytes()
    return get_bytes(src_key_or_url)


def _guess_ext(src_key_or_url: str, default_ext: str) -> str:
    if _is_http_url(src_key_or_url):
        parsed = urlparse(src_key_or_url)
        suffix = Path(parsed.path).suffix
        return suffix or default_ext
    return Path(src_key_or_url).suffix or default_ext


def _escape_drawtext_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace(",", "\\,")
        .replace("\n", " ")
    )


def _wrap_caption_lines(text: str, *, max_chars: int = 42, max_lines: int = 2) -> list[str]:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return []
    words = cleaned.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
            if len(lines) >= max_lines:
                last = lines[-1]
                lines[-1] = last[: max(0, max_chars - 1)].rstrip() + "…"
                return lines
        current = word if len(word) <= max_chars else word[: max_chars - 1] + "…"
    if current and len(lines) < max_lines:
        lines.append(current)
    elif current and lines:
        lines[-1] = lines[-1][: max(0, max_chars - 1)].rstrip() + "…"
    return lines[:max_lines]


def _source_start_sec(clip: dict[str, Any]) -> float:
    return max(0.0, float(clip.get("source_start_sec") or 0.0))


def _clip_vf(clip: dict[str, Any]) -> str:
    return build_segment_vf(
        fit=str(clip.get("fit", "cover")),
        duration_sec=float(clip["duration_sec"]),
        animation=clip.get("animation") if isinstance(clip.get("animation"), dict) else None,
        transform=clip.get("transform") if isinstance(clip.get("transform"), dict) else None,
        fps=30,
    )


def _broll_vf(clip: dict[str, Any]) -> str:
    return build_broll_vf(
        fit=str(clip.get("fit", "cover")),
        duration_sec=float(clip["duration_sec"]),
        animation=clip.get("animation") if isinstance(clip.get("animation"), dict) else None,
        transform=clip.get("transform") if isinstance(clip.get("transform"), dict) else None,
        fps=30,
    )


def _render_segment(clip: dict[str, Any], input_path: Path, segment_path: Path) -> None:
    duration = clip["duration_sec"]
    vf = _clip_vf(clip)
    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(input_path),
        "-t",
        str(duration),
        "-vf",
        vf,
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(segment_path),
    ]
    _run_ffmpeg(cmd)


def _ass_timestamp(sec: float) -> str:
    if sec < 0:
        sec = 0.0
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    cs = int(round((sec - int(sec)) * 100))
    if cs >= 100:
        s += 1
        cs = 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_bgr_from_hex(hex_color: str) -> str:
    """Convert 0xRRGGBB / #RRGGBB / white → ASS &HAABBGGRR primary colour."""
    raw = (hex_color or "").strip().lower()
    if raw in ("white", "#fff", "#ffffff"):
        return "&H00FFFFFF"
    raw = raw.removeprefix("0x").removeprefix("#")
    if len(raw) != 6:
        return "&H00FFFFFF"
    try:
        r = int(raw[0:2], 16)
        g = int(raw[2:4], 16)
        b = int(raw[4:6], 16)
    except ValueError:
        return "&H00FFFFFF"
    return f"&H00{b:02X}{g:02X}{r:02X}"


def _write_captions_ass(
    captions: list[dict[str, Any]],
    path: Path,
    *,
    theme: dict[str, Any] | None = None,
) -> None:
    """Write ASS burn-in; honor optional transform (x/y %, scale, rotation) and style."""
    palette = (theme or {}).get("palette") or {}
    primary = _ass_bgr_from_hex(str(palette.get("caption_primary") or "0xFFFFFF"))
    font_scale = float((theme or {}).get("font_scale") or 1.0)
    base_fontsize = max(28, int(round(36 * font_scale)))
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "WrapStyle: 0",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        # Alignment 5 = center (pos overrides placement).
        f"Style: Default,Arial,{base_fontsize},{primary},&H000000FF,&H00000000,&H64000000,"
        "0,0,0,0,100,100,0,0,1,2,0,5,40,40,40,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for cap in captions:
        raw = str(cap.get("text") or "").strip()
        if not raw:
            continue
        start = float(cap["start_sec"])
        end = start + float(cap["duration_sec"])
        wrapped = _wrap_caption_lines(raw, max_chars=42, max_lines=2)
        text = "\\N".join(wrapped).replace("{", "(").replace("}", ")")
        t = cap.get("transform") if isinstance(cap.get("transform"), dict) else {}
        x_pct = float(t.get("x") if t.get("x") is not None else 50.0)
        y_pct = float(t.get("y") if t.get("y") is not None else 88.0)
        sx = float(t.get("scaleX") if t.get("scaleX") is not None else 1.0)
        sy = float(t.get("scaleY") if t.get("scaleY") is not None else 1.0)
        rot = float(t.get("rotation") if t.get("rotation") is not None else 0.0)
        px = int(round(max(0.0, min(100.0, x_pct)) / 100.0 * 1920))
        py = int(round(max(0.0, min(100.0, y_pct)) / 100.0 * 1080))
        fscx = max(20, min(400, int(round(sx * 100))))
        fscy = max(20, min(400, int(round(sy * 100))))
        # ASS \frz is counter-clockwise; editor rotation is clockwise.
        frz = -rot
        style = cap.get("style") if isinstance(cap.get("style"), dict) else {}
        fs_px = style.get("font_size_px")
        # Editor canvas uses ~18–28; map toward 1080p ASS sizes (~2.2×).
        if fs_px is not None:
            fontsize = max(18, min(96, int(round(float(fs_px) * 2.2))))
        else:
            fontsize = base_fontsize
        color_raw = style.get("color")
        if isinstance(color_raw, str) and color_raw.strip():
            hex_color = color_raw.strip().lstrip("#")
            if not hex_color.lower().startswith("0x"):
                hex_color = f"0x{hex_color}"
            primary_override = _ass_bgr_from_hex(hex_color)
        else:
            primary_override = primary
        bold = 1 if str(style.get("font_weight") or "").strip() in {"600", "700", "800", "bold"} else 0
        override = (
            f"{{\\pos({px},{py})\\fscx{fscx}\\fscy{fscy}\\frz{frz:.2f}"
            f"\\fs{fontsize}\\c{primary_override}\\b{bold}}}"
        )
        anim = cap.get("animation") if isinstance(cap.get("animation"), dict) else {}
        in_edge = anim.get("in") if isinstance(anim.get("in"), dict) else {}
        out_edge = anim.get("out") if isinstance(anim.get("out"), dict) else {}
        in_dur = float(in_edge.get("duration_sec") or 0.0)
        out_dur = float(out_edge.get("duration_sec") or 0.0)
        fade_tags = ""
        if in_dur > 0.05 or out_dur > 0.05:
            fade_tags = f"{{\\fad({int(in_dur * 1000)},{int(out_dur * 1000)})}}"
        lines.append(
            f"Dialogue: 0,{_ass_timestamp(start)},{_ass_timestamp(end)},Default,,0,0,0,,"
            f"{override}{fade_tags}{text}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _escape_filter_path(path: Path) -> str:
    # FFmpeg filter paths on Windows: escape drive colon and use forward slashes.
    s = path.resolve().as_posix()
    if len(s) >= 2 and s[1] == ":":
        s = s[0] + "\\:" + s[2:]
    return s.replace("'", "\\'")


def _overlay_xy_from_transform(
    transform: dict[str, Any] | None,
    *,
    default_x: str,
    default_y: str,
) -> tuple[str, str, float]:
    """Return drawtext x/y expressions and fontsize scale from transform."""
    t = transform if isinstance(transform, dict) else {}
    if not t:
        return default_x, default_y, 1.0
    x_pct = float(t.get("x") if t.get("x") is not None else 50.0)
    y_pct = float(t.get("y") if t.get("y") is not None else 50.0)
    sx = float(t.get("scaleX") if t.get("scaleX") is not None else 1.0)
    x_expr = f"(w*{x_pct / 100.0:.4f})-(text_w/2)"
    y_expr = f"(h*{y_pct / 100.0:.4f})-(text_h/2)"
    return x_expr, y_expr, max(0.35, min(3.0, sx))


def _build_drawtext_filters(
    captions: list[dict[str, Any]],
    overlays: list[dict[str, Any]],
    *,
    captions_enabled: bool = True,
    theme: dict[str, Any] | None = None,
) -> list[str]:
    """Overlay templates only (captions burn via ASS to avoid Windows cmdline limits)."""
    del captions, captions_enabled  # captions handled by ASS
    filters: list[str] = []
    theme = theme or {}
    palette = theme.get("palette") or {}
    cta_box = str(palette.get("primary") or "0xE11D48")
    cta_text = str(palette.get("text") or "white")
    chapter_box = str(palette.get("chapter_box") or "black@0.45")
    chapter_text = str(palette.get("text") or "white")
    font_scale = float(theme.get("font_scale") or 1.0)
    cta_size = int(round(float(theme.get("cta_fontsize") or 40) * font_scale))
    chapter_size = int(round(float(theme.get("chapter_fontsize") or 52) * font_scale))

    for overlay in overlays:
        otype = str(overlay.get("type") or "")
        start = float(overlay["start_sec"])
        end = start + float(overlay["duration_sec"])
        label = _escape_drawtext_text(str(overlay.get("text") or ""))
        if not label:
            continue
        transform = overlay.get("transform") if isinstance(overlay.get("transform"), dict) else None
        if otype == "subscribe_cta":
            x_expr, y_expr, scale = _overlay_xy_from_transform(
                transform,
                default_x="w-text_w-56",
                default_y="56",
            )
            size = int(round(cta_size * scale))
            filters.append(
                "drawtext="
                f"text='{label}':"
                f"x={x_expr}:"
                f"y={y_expr}:"
                f"fontsize={size}:"
                f"fontcolor={cta_text}:"
                "box=1:"
                f"boxcolor={cta_box}@0.92:"
                "boxborderw=14:"
                "borderw=0:"
                f"enable='between(t,{start:.3f},{end:.3f})'"
            )
        elif otype == "chapter_title":
            x_expr, y_expr, scale = _overlay_xy_from_transform(
                transform,
                default_x="(w-text_w)/2",
                default_y="h*0.38",
            )
            size = int(round(chapter_size * scale))
            filters.append(
                "drawtext="
                f"text='{label}':"
                f"x={x_expr}:"
                f"y={y_expr}:"
                f"fontsize={size}:"
                f"fontcolor={chapter_text}:"
                "box=1:"
                f"boxcolor={chapter_box}:"
                "boxborderw=18:"
                "borderw=0:"
                f"enable='between(t,{start:.3f},{end:.3f})'"
            )
    return filters


def _theme_grade_filter(theme: dict[str, Any] | None) -> str | None:
    """Optional full-frame visual grade from theme (FFmpeg eq)."""
    if not theme:
        return None
    grade = theme.get("visual_grade") or {}
    intensity = float(grade.get("intensity") or 0.0)
    if intensity <= 0.001:
        return None
    eq = str(grade.get("eq") or "").strip()
    if not eq:
        return None
    return f"eq={eq}"


def _overlay_broll_clips(
    base_video: Path,
    broll_clips: list[dict[str, Any]],
    work_dir: Path,
) -> Path:
    """B-roll overlays timed to narration-matched windows.

    Encodes each still only for its on-screen duration (not the full timeline),
    applies transform + In/Out animation, then delays to start_sec via setpts.
    """
    if not broll_clips:
        return base_video

    inputs: list[str] = ["-i", str(base_video)]
    prepared: list[tuple[Path, dict[str, Any]]] = []
    for i, clip in enumerate(broll_clips):
        src = clip["src"]
        ext = _guess_ext(src, ".jpg")
        raw = work_dir / f"broll_raw_{i}{ext}"
        raw.write_bytes(_read_source_bytes(src))
        still = work_dir / f"broll_still_{i}.mp4"
        hold_sec = max(0.5, float(clip["duration_sec"]) + 0.15)
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-loop",
                "1",
                "-i",
                str(raw),
                "-t",
                f"{hold_sec:.3f}",
                "-vf",
                _broll_vf(clip),
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-an",
                str(still),
            ]
        )
        prepared.append((still, clip))
        inputs.extend(["-i", str(still)])

    parts: list[str] = []
    last = "[0:v]"
    for i, (_path, clip) in enumerate(prepared):
        start = float(clip["start_sec"])
        end = start + float(clip["duration_sec"])
        out = f"[v{i}]"
        transform = clip.get("transform") if isinstance(clip.get("transform"), dict) else None
        x_expr, y_expr, _sx, _sy = broll_overlay_xy(transform)
        parts.append(
            f"[{i + 1}:v]format=yuv420p,"
            f"setpts=PTS-STARTPTS+{start:.3f}/TB[b{i}]"
        )
        parts.append(
            f"{last}[b{i}]overlay=x='{x_expr}':y='{y_expr}':"
            f"eof_action=pass:enable='between(t,{start:.3f},{end:.3f})'{out}"
        )
        last = out
    filter_complex = ";".join(parts)
    out_path = work_dir / "video_with_broll.mp4"
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            last,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out_path),
        ]
    )
    return out_path


def _mix_narration_with_whooshes(
    *,
    narration_clips: list[tuple[Path, dict[str, Any]]],
    cues: list[dict[str, Any]],
    work_dir: Path,
    output_path: Path,
    music_clips: list[tuple[Path, dict[str, Any]]] | None = None,
    music_volume: float = 0.28,
    narration_volume: float = 1.0,
    sfx_volume: float = 0.5,
) -> None:
    """Mix narration beds (timed) + transition whooshes + optional music beds (with fades)."""
    whoosh_gain = 0.55 * max(0.0, min(1.0, float(sfx_volume)))
    whoosh_paths: list[Path] = []
    active_cues = cues if whoosh_gain > 0.001 else []
    for i, cue in enumerate(active_cues):
        path = work_dir / f"whoosh_{i}.wav"
        synthesize_transition_whoosh(output_path=path, duration_sec=float(cue["duration_sec"]))
        whoosh_paths.append(path)

    inputs: list[str] = []
    next_idx = 0
    parts: list[str] = []
    mix_labels: list[str] = []

    global_narration = max(0.0, min(1.0, narration_volume))
    for ni, (path, clip) in enumerate(narration_clips):
        inputs.extend(["-i", str(path)])
        idx = next_idx
        next_idx += 1
        clip_vol = float(clip.get("volume") if clip.get("volume") is not None else 1.0)
        vol = global_narration * max(0.0, min(1.0, clip_vol))
        start_sec = float(clip.get("start_sec") or 0.0)
        dur = float(clip.get("duration_sec") or 0.0)
        source_start = _source_start_sec(clip)
        fade_in = max(0.0, float(clip.get("fade_in_sec") or 0.0))
        fade_out = max(0.0, float(clip.get("fade_out_sec") or 0.0))
        delay_ms = int(max(0.0, start_sec) * 1000)
        chain: list[str] = [
            "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo",
        ]
        if dur > 0.05:
            trim_end = source_start + dur
            chain.append(f"atrim={source_start:.3f}:{trim_end:.3f},asetpts=PTS-STARTPTS")
        afade_parts: list[str] = []
        if fade_in > 0.02:
            afade_parts.append(f"afade=t=in:st=0:d={fade_in:.3f}")
        if fade_out > 0.02 and dur > fade_out:
            afade_parts.append(f"afade=t=out:st={max(0.0, dur - fade_out):.3f}:d={fade_out:.3f}")
        chain.extend(afade_parts)
        if delay_ms > 0:
            chain.append(f"adelay={delay_ms}|{delay_ms}")
        chain.append(f"volume={vol:.3f}")
        parts.append(f"[{idx}:a]{','.join(chain)}[n{ni}]")
        mix_labels.append(f"[n{ni}]")

    whoosh_start_idx = next_idx
    for path in whoosh_paths:
        inputs.extend(["-i", str(path)])
        next_idx += 1

    music_entries = music_clips or []
    music_start_idx = next_idx
    for path, _clip in music_entries:
        inputs.extend(["-i", str(path)])
        next_idx += 1

    for i, cue in enumerate(active_cues):
        delay_ms = int(float(cue["at_sec"]) * 1000)
        parts.append(
            f"[{whoosh_start_idx + i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
            f"adelay={delay_ms}|{delay_ms},volume={whoosh_gain:.3f}[w{i}]"
        )
        mix_labels.append(f"[w{i}]")

    global_music = max(0.0, min(1.0, music_volume))
    global_sfx = max(0.0, min(1.0, sfx_volume))
    for mi, (_path, clip) in enumerate(music_entries):
        idx = music_start_idx + mi
        clip_vol = float(clip.get("volume") if clip.get("volume") is not None else 1.0)
        # Editor SFX lane exports as music clips with mood="sfx" (schema-safe bus tag).
        is_sfx = str(clip.get("mood") or "").strip().lower() == "sfx"
        bus = global_sfx if is_sfx else global_music
        vol = bus * max(0.0, min(1.0, clip_vol))
        start_sec = float(clip.get("start_sec") or 0.0)
        dur = float(clip.get("duration_sec") or 0.0)
        source_start = _source_start_sec(clip)
        fade_in = max(0.0, float(clip.get("fade_in_sec") or 0.0))
        fade_out = max(0.0, float(clip.get("fade_out_sec") or 0.0))
        delay_ms = int(max(0.0, start_sec) * 1000)
        afade_parts: list[str] = []
        if fade_in > 0.02:
            afade_parts.append(f"afade=t=in:st=0:d={fade_in:.3f}")
        if fade_out > 0.02 and dur > fade_out:
            afade_parts.append(f"afade=t=out:st={max(0.0, dur - fade_out):.3f}:d={fade_out:.3f}")
        chain: list[str] = [
            "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo",
        ]
        if source_start > 0.02 or dur > 0.05:
            trim_end = source_start + max(dur, 0.05)
            chain.append(f"atrim={source_start:.3f}:{trim_end:.3f},asetpts=PTS-STARTPTS")
        chain.extend(afade_parts)
        if delay_ms > 0:
            chain.append(f"adelay={delay_ms}|{delay_ms}")
        chain.append(f"volume={vol:.3f}")
        parts.append(f"[{idx}:a]{','.join(chain)}[m{mi}]")
        mix_labels.append(f"[m{mi}]")

    if not mix_labels:
        # Silence fallback (1s) — caller should usually have at least narration.
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=stereo",
                "-t",
                "1",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ]
        )
        return

    if len(mix_labels) == 1 and not active_cues and not music_entries and len(narration_clips) == 1:
        # Fast path: single full narration with no delay/trim/fade/source offset.
        clip0 = narration_clips[0][1]
        start0 = float(clip0.get("start_sec") or 0.0)
        source0 = _source_start_sec(clip0)
        fade_in0 = float(clip0.get("fade_in_sec") or 0.0)
        fade_out0 = float(clip0.get("fade_out_sec") or 0.0)
        if start0 < 0.02 and source0 < 0.02 and fade_in0 < 0.02 and fade_out0 < 0.02:
            shutil.copyfile(narration_clips[0][0], output_path)
            return

    n = len(mix_labels)
    parts.append(
        f"{''.join(mix_labels)}amix=inputs={n}:duration=longest:dropout_transition=0,"
        f"alimiter=limit=0.95[aout]"
    )
    filter_complex = ";".join(parts)

    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            "[aout]",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
    )


def render_manifest(manifest: dict, work_dir: Path) -> Path:
    video_clips = manifest["tracks"]["video"]
    audio_clips = manifest["tracks"]["audio"]
    if not video_clips:
        raise ValueError("Timeline has no video clips")

    segment_paths: list[Path] = []
    clip_ids: list[str] = []
    for i, clip in enumerate(video_clips):
        src_key = clip["src"]
        clip_type = clip.get("type", "image")
        default_ext = ".mp4" if clip_type == "video" else ".jpg"
        ext = _guess_ext(src_key, default_ext)
        input_path = work_dir / f"input_{i}{ext}"
        input_path.write_bytes(_read_source_bytes(src_key))

        segment_path = work_dir / f"segment_{i}.mp4"
        if clip_type == "video" and ext == ".mp4":
            vf = _clip_vf(clip)
            ss = _source_start_sec(clip)
            cmd = ["ffmpeg", "-y"]
            if ss > 0.02:
                cmd.extend(["-ss", f"{ss:.3f}"])
            cmd.extend(
                [
                    "-i",
                    str(input_path),
                    "-t",
                    str(clip["duration_sec"]),
                    "-vf",
                    vf,
                    "-r",
                    "30",
                    "-an",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    str(segment_path),
                ]
            )
            _run_ffmpeg(cmd)
        else:
            _render_segment(clip, input_path, segment_path)
        segment_paths.append(segment_path)
        clip_ids.append(str(clip["id"]))

    transitions = manifest.get("transitions") or []
    if transitions and len(segment_paths) > 1:
        video_only = chain_segments_with_clips(segment_paths, clip_ids, transitions, work_dir)
    else:
        video_only = work_dir / "video_only.mp4"
        concat_segments(segment_paths, video_only)

    broll_clips = list(manifest.get("tracks", {}).get("broll") or [])
    video_with_broll = _overlay_broll_clips(video_only, broll_clips, work_dir)

    settings = manifest.get("settings") or {}
    music_clips = list(manifest.get("tracks", {}).get("music") or [])
    music_volume = float(settings.get("music_volume", 0.28))
    prepared_music: list[tuple[Path, dict[str, Any]]] = []
    for mi, mclip in enumerate(music_clips):
        path = work_dir / f"music_bed_{mi}.wav"
        path.write_bytes(_read_source_bytes(mclip["src"]))
        prepared_music.append((path, mclip))

    prepared_narration: list[tuple[Path, dict[str, Any]]] = []
    for ai, aclip in enumerate(audio_clips):
        path = work_dir / f"narration_{ai}.wav"
        path.write_bytes(_read_source_bytes(aclip["src"]))
        prepared_narration.append((path, aclip))

    narration_volume = float(
        settings.get(
            "narration_volume",
            (audio_clips[0].get("volume", 1.0) if audio_clips else 1.0),
        )
    )
    sfx_volume = float(settings.get("sfx_volume", 0.5))
    sfx_cues = collect_transition_sfx_cues(video_clips, transitions)
    mixed_audio = work_dir / "narration_with_sfx.wav"
    _mix_narration_with_whooshes(
        narration_clips=prepared_narration,
        cues=sfx_cues,
        work_dir=work_dir,
        output_path=mixed_audio,
        music_clips=prepared_music,
        music_volume=music_volume,
        narration_volume=narration_volume,
        sfx_volume=sfx_volume,
    )

    video_for_final = video_with_broll
    captions = manifest.get("tracks", {}).get("captions", []) or []
    overlays = manifest.get("overlays") or []
    captions_enabled = bool(settings.get("captions_enabled", True))
    try:
        from src.render.themes import get_theme
    except ImportError:
        get_theme = None  # type: ignore[assignment]
    theme = get_theme(str(settings.get("theme_id") or "standard")) if get_theme else None
    vf_parts: list[str] = []
    grade = _theme_grade_filter(theme)
    if grade:
        vf_parts.append(grade)
    if captions_enabled and captions:
        ass_path = work_dir / "captions.ass"
        _write_captions_ass(captions, ass_path, theme=theme)
        vf_parts.append(f"ass='{_escape_filter_path(ass_path)}'")
    vf_parts.extend(
        _build_drawtext_filters(captions, overlays, captions_enabled=False, theme=theme)
    )
    if vf_parts:
        # Prefer filter script so Windows cmdline length limits don't break long videos.
        script_path = work_dir / "overlays.vf"
        script_path.write_text(",".join(vf_parts), encoding="utf-8")
        video_captioned = work_dir / "video_with_overlays.mp4"
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_with_broll),
                "-filter_script:v",
                str(script_path),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(video_captioned),
            ]
        )
        video_for_final = video_captioned

    final_path = work_dir / "final.mp4"
    narr_dur = _probe_duration(mixed_audio)
    vid_dur = _probe_duration(video_for_final)
    if vid_dur + 0.05 < narr_dur:
        padded = work_dir / "video_padded.mp4"
        pad_sec = narr_dur - vid_dur
        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_for_final),
                "-vf",
                f"tpad=stop_mode=clone:stop_duration={pad_sec:.3f}",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(padded),
            ]
        )
        video_for_final = padded

    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_for_final),
            "-i",
            str(mixed_audio),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            str(final_path),
        ],
    )
    return final_path


def render_from_timeline_key(timeline_key: str, project_id: str, run_id: str) -> tuple[str, float]:
    """Render MP4 and return (s3_key, probed_duration_sec)."""
    manifest = json.loads(get_bytes(timeline_key).decode("utf-8"))
    validate_manifest(manifest)
    with tempfile.TemporaryDirectory() as tmp:
        final_path = render_manifest(manifest, Path(tmp))
        duration_sec = _probe_duration(final_path)
        output_key = f"projects/{project_id}/runs/{run_id}/final.mp4"
        put_bytes(output_key, final_path.read_bytes(), "video/mp4")
        return output_key, float(duration_sec)
