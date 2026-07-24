"""FFmpeg transition effects between adjacent video segments.

xfade types are mapped in motion_filters.XFADE_TRANSITION_MAP.
Custom graphs (film-burn, glitch) and hard cut stay here.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from src.render.motion_filters import map_xfade_name, normalize_transition_type


def _run_ffmpeg(cmd: list[str]) -> None:
    result = subprocess.run(
        cmd,
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        tail = (result.stderr or "")[-800:]
        raise RuntimeError(f"ffmpeg failed ({result.returncode}): {tail}")


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


def map_transition_type(transition_type: str) -> str:
    return map_xfade_name(transition_type)


def render_xfade_pair(
    *,
    left_path: Path,
    right_path: Path,
    output_path: Path,
    transition_type: str,
    duration_sec: float,
    offset_sec: float,
) -> None:
    xfade_name = map_transition_type(transition_type)
    dur = max(0.1, float(duration_sec))
    offset = max(0.0, float(offset_sec))
    filter_expr = (
        f"[0:v][1:v]xfade=transition={xfade_name}:duration={dur:.3f}:offset={offset:.3f},"
        f"format=yuv420p[v]"
    )
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(left_path),
            "-i",
            str(right_path),
            "-filter_complex",
            filter_expr,
            "-map",
            "[v]",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )


def render_film_burn_transition(
    *,
    left_path: Path,
    right_path: Path,
    output_path: Path,
    duration_sec: float,
    offset_sec: float,
) -> None:
    """Film-burn: fade through black with warm grade + vignette only during the blend."""
    dur = max(0.1, float(duration_sec))
    offset = max(0.0, float(offset_sec))
    end = offset + dur
    filter_expr = (
        f"[0:v]eq=saturation=1.25:gamma_r=1.08:contrast=1.05[a];"
        f"[1:v]eq=saturation=1.25:gamma_r=1.08:contrast=1.05[b];"
        f"[a][b]xfade=transition=fadeblack:duration={dur:.3f}:offset={offset:.3f}[xf];"
        f"[xf]split[base][fx];"
        f"[fx]eq=saturation=1.55:brightness=0.06:contrast=1.2,"
        f"vignette=PI/3.5,noise=alls=18:allf=t+u[burn];"
        f"[base][burn]overlay=enable='between(t\\,{offset:.3f}\\,{end:.3f})',"
        f"format=yuv420p[v]"
    )
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(left_path),
            "-i",
            str(right_path),
            "-filter_complex",
            filter_expr,
            "-map",
            "[v]",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )


def render_glitch_transition(
    *,
    left_path: Path,
    right_path: Path,
    output_path: Path,
    duration_sec: float,
    offset_sec: float,
) -> None:
    """Glitch: dissolve base + RGB shift/noise only during the blend window."""
    dur = max(0.1, float(duration_sec))
    offset = max(0.0, float(offset_sec))
    end = offset + dur
    filter_expr = (
        f"[0:v][1:v]xfade=transition=dissolve:duration={dur:.3f}:offset={offset:.3f}[xf];"
        f"[xf]split[base][fx];"
        f"[fx]noise=alls=40:allf=t+u,rgbashift=rh=8:gh=-5:bv=6[gl];"
        f"[base][gl]overlay=enable='between(t\\,{offset:.3f}\\,{end:.3f})',"
        f"format=yuv420p[v]"
    )
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(left_path),
            "-i",
            str(right_path),
            "-filter_complex",
            filter_expr,
            "-map",
            "[v]",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )


def render_transition_pair(
    *,
    left_path: Path,
    right_path: Path,
    output_path: Path,
    transition: dict[str, Any],
    left_duration_sec: float,
) -> None:
    t_type = normalize_transition_type(str(transition.get("type") or "fade"))
    if t_type == "cut" or transition.get("enabled") is False:
        concat_segments([left_path, right_path], output_path)
        return

    dur = float(transition.get("duration_sec") or 0.5)
    offset = max(0.0, left_duration_sec - dur)

    if t_type == "glitch":
        render_glitch_transition(
            left_path=left_path,
            right_path=right_path,
            output_path=output_path,
            duration_sec=dur,
            offset_sec=offset,
        )
        return
    if t_type == "film-burn":
        render_film_burn_transition(
            left_path=left_path,
            right_path=right_path,
            output_path=output_path,
            duration_sec=dur,
            offset_sec=offset,
        )
        return

    render_xfade_pair(
        left_path=left_path,
        right_path=right_path,
        output_path=output_path,
        transition_type=t_type,
        duration_sec=dur,
        offset_sec=offset,
    )


def concat_segments(segment_paths: list[Path], output_path: Path) -> None:
    concat_list = output_path.parent / f"{output_path.stem}_concat.txt"
    concat_list.write_text(
        "\n".join(f"file '{p.as_posix()}'" for p in segment_paths),
        encoding="utf-8",
    )
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(output_path),
        ]
    )


def synthesize_transition_whoosh(
    *,
    output_path: Path,
    duration_sec: float = 0.45,
    sample_rate: int = 44100,
) -> None:
    """Generate a short whoosh SFX (band-limited noise with fade) for a transition."""
    dur = max(0.15, float(duration_sec))
    filter_expr = (
        f"anoisesrc=d={dur:.3f}:c=pink:r={sample_rate},"
        f"highpass=f=200,lowpass=f=4000,"
        f"afade=t=in:st=0:d={dur * 0.25:.3f},"
        f"afade=t=out:st={dur * 0.35:.3f}:d={dur * 0.65:.3f},"
        f"volume=0.35"
    )
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            filter_expr,
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
    )


def chain_segments_with_clips(
    segment_paths: list[Path],
    clip_ids: list[str],
    transitions: list[dict[str, Any]],
    work_dir: Path,
) -> Path:
    """Chain segments; transitions reference manifest video clip ids."""
    if len(segment_paths) != len(clip_ids):
        raise ValueError("segment_paths and clip_ids length mismatch")
    by_after = {
        str(t["after_clip_id"]): t
        for t in transitions
        if t.get("enabled", True) and t.get("after_clip_id")
    }

    current = segment_paths[0]
    current_dur = _probe_duration(current)

    for i in range(1, len(segment_paths)):
        trans = by_after.get(clip_ids[i - 1])
        next_seg = segment_paths[i]
        out = work_dir / f"chain_{i}.mp4"
        if trans and normalize_transition_type(str(trans.get("type") or "")) != "cut":
            render_transition_pair(
                left_path=current,
                right_path=next_seg,
                output_path=out,
                transition=trans,
                left_duration_sec=current_dur,
            )
            td = float(trans.get("duration_sec") or 0.5)
            current_dur = current_dur + _probe_duration(next_seg) - td
        else:
            concat_segments([current, next_seg], out)
            current_dur = current_dur + _probe_duration(next_seg)
        current = out
    return current


def collect_transition_sfx_cues(
    video_clips: list[dict[str, Any]],
    transitions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return whoosh cues at transition start times (skip when sfx_muted)."""
    by_id = {str(c["id"]): c for c in video_clips}
    cues: list[dict[str, Any]] = []
    for t in transitions:
        if not t.get("enabled", True):
            continue
        if t.get("sfx_muted"):
            continue
        t_type = normalize_transition_type(str(t.get("type") or ""))
        if t_type == "cut":
            continue
        after = by_id.get(str(t.get("after_clip_id") or ""))
        if not after:
            continue
        start = float(after["start_sec"]) + float(after["duration_sec"]) - float(
            t.get("duration_sec") or 0.5
        )
        cues.append(
            {
                "at_sec": max(0.0, start),
                "duration_sec": min(0.5, float(t.get("duration_sec") or 0.5)),
            }
        )
    return cues
