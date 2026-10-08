"""Deterministic absolute-time export, shared SVG graphics, and bounded native jobs.

Section boundaries are media clip boundaries. Transitions replace the tail of
the outgoing clip; the next clip's first frame is held during that tail, so no
timeline time is removed. Audio and graphics retain their absolute timestamps.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shlex
import signal
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

from src.config import settings
from src.pipeline.storage import download_file
from src.render.motion_filters import build_segment_vf, map_xfade_name, normalize_transition_type
from src.render.visual_effects import visual_filter
from src.render import section_cache

Progress = Callable[[int, str], None]
ENGINE_VERSION = "native-v1.6"


class RenderCancelled(RuntimeError):
    pass


class Runner:
    def __init__(self, cancel: threading.Event | None = None):
        self.cancel = cancel or threading.Event()

    def run(self, args: list[str]) -> None:
        if self.cancel.is_set():
            raise RenderCancelled("Render cancelled")
        # A file prevents stderr pipe deadlock on lengthy failed encodes.
        with tempfile.TemporaryFile() as errors:
            three_job = any("render-three.ts" in arg or "render-html.ts" in arg for arg in args)
            proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                    stderr=errors, start_new_session=three_job and os.name != "nt")
            try:
                while proc.poll() is None:
                    if self.cancel.wait(0.1):
                        if os.name == "nt" and three_job:
                            # Windows terminate() bypasses Node's SIGTERM cleanup handler.
                            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                        elif three_job:
                            os.killpg(proc.pid, signal.SIGTERM)
                        else:
                            proc.terminate()
                        try:
                            proc.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            if three_job and os.name != "nt":
                                os.killpg(proc.pid, signal.SIGKILL)
                            else:
                                proc.kill()
                        raise RenderCancelled("Render cancelled")
                if proc.returncode:
                    errors.seek(max(0, errors.tell() - 3000))
                    detail = errors.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"{Path(args[0]).name} failed ({proc.returncode}): {detail}")
            finally:
                if proc.poll() is None:
                    if three_job and os.name != "nt":
                        os.killpg(proc.pid, signal.SIGKILL)
                    else:
                        proc.kill()
                    proc.wait()

    def ffmpeg(self, args: list[str]) -> None:
        self.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                  "-threads", str(max(1, settings.render_ffmpeg_threads)),
                  "-filter_threads", "1", "-filter_complex_threads", "1", *args])

    def graphics_pipe(self, graphics: list[str], args: list[str]) -> None:
        """Bounded RGBA pipe avoids PNG encoding, decoding, and frame files."""
        ffmpeg = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-threads",
                  str(max(1, settings.render_ffmpeg_threads)), "-filter_threads", "1",
                  "-filter_complex_threads", "1", *args]
        if self.cancel.is_set():
            raise RenderCancelled("Render cancelled")
        with tempfile.TemporaryFile() as ff_errors, tempfile.TemporaryFile() as gfx_errors:
            encoder = subprocess.Popen(ffmpeg, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=ff_errors)
            rasterizer = subprocess.Popen(graphics, stdin=subprocess.DEVNULL, stdout=encoder.stdin, stderr=gfx_errors)
            assert encoder.stdin is not None
            encoder.stdin.close()
            try:
                while encoder.poll() is None or rasterizer.poll() is None:
                    if self.cancel.wait(.05):
                        raise RenderCancelled("Render cancelled")
                    if encoder.poll() is not None and encoder.returncode != 0:
                        rasterizer.terminate()
                    if rasterizer.poll() is not None and rasterizer.returncode != 0:
                        encoder.terminate()
                if encoder.returncode or rasterizer.returncode:
                    details = []
                    for error in (ff_errors, gfx_errors):
                        error.seek(max(0, error.tell() - 3000))
                        details.append(error.read().decode("utf-8", errors="replace"))
                    raise RuntimeError("Graphics/compositor pipe failed: " + "\n".join(details))
            finally:
                for proc in (encoder, rasterizer):
                    if proc.poll() is None:
                        proc.terminate()
                        try:
                            proc.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.wait()


@lru_cache(maxsize=3)
def select_encoder(requested: str = "auto") -> str:
    """Probe a real encode; an encoder listed by FFmpeg may have no GPU driver."""
    if requested not in {"auto", "libx264", "h264_nvenc"}:
        raise ValueError("RENDER_ENCODER must be auto|libx264|h264_nvenc")
    if requested == "libx264":
        return "libx264"
    try:
        result = subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
            # Some laptop NVENC devices reject heights below their minimum.
            "color=s=320x180:r=30:d=0.1", "-frames:v", "1", "-c:v", "h264_nvenc",
            "-f", "null", "-"], capture_output=True, timeout=15)
        if result.returncode == 0:
            return "h264_nvenc"
    except (OSError, subprocess.TimeoutExpired):
        pass
    if requested == "h264_nvenc":
        raise RuntimeError("Requested h264_nvenc is unavailable on this worker")
    return "libx264"


def encoding_args(encoder: str) -> list[str]:
    if encoder == "h264_nvenc":
        return ["-c:v", encoder, "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"]
    return ["-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-threads", str(max(1, settings.render_ffmpeg_threads))]


def probe(path: Path) -> dict[str, Any]:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                             "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def stage_assets(manifest: dict, directory: Path) -> dict[str, Path]:
    sources = {str(c["src"]) for track in ("video", "audio", "broll", "music")
               for c in manifest["tracks"].get(track, []) if c.get("src")}
    sources.update(str(g["src"]) for g in manifest.get("graphics", []) if g.get("src"))
    for overlay in manifest.get("overlays", []):
        sources.update(str(src) for src in overlay.get("image_refs", []) if src)
        sources.update(str(layer["src"]) for layer in (overlay.get("scene") or {}).get("layers", []) if layer.get("src"))
    background = (manifest.get("settings") or {}).get("background_image")
    if background:
        sources.add(str(background))
    staged = {}
    for src in sorted(sources):
        suffix = Path(src.split("?", 1)[0]).suffix or ".bin"
        path = directory / (hashlib.sha256(src.encode()).hexdigest()[:20] + suffix)
        if src.startswith("color:"):
            color = src[len("color:"):]
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                raise ValueError("Invalid color placeholder")
            path = path.with_suffix(".png")
            Runner().ffmpeg(["-f", "lavfi", "-i", f"color=c={color}:s=64x64", "-frames:v", "1", str(path)])
        elif src.startswith("static:sfx/"):
            name = src[len("static:sfx/"):]
            if Path(name).name != name:
                raise ValueError("Invalid static sound path")
            root = Path(__file__).resolve().parents[4]
            source = root / "render-service/static/sfx" / name
            if not source.is_file():
                source = root / "apps/web/public/sfx" / name
            if not source.is_file():
                raise ValueError(f"Bundled sound is unavailable: {name}")
            shutil.copyfile(source, path)
        elif src.startswith(("http://", "https://")):
            with urllib.request.urlopen(src, timeout=60) as response, path.open("wb") as out:
                shutil.copyfileobj(response, out, length=1024 * 1024)
        elif Path(src).is_file():
            shutil.copyfile(src, path)
        else:
            download_file(src, path)
        staged[src] = path
    return staged


def source_args(clip: dict, path: Path, fps: int) -> list[str]:
    if clip.get("type", "image") == "video":
        return ["-ss", str(max(0.0, float(clip.get("source_start_sec") or 0))), "-i", str(path)]
    return ["-loop", "1", "-framerate", str(fps), "-i", str(path)]


def clip_filter(clip: dict, duration: float, width: int, height: int, fps: int, *, transparent: bool = False) -> str:
    vf = build_segment_vf(fit=str(clip.get("fit", "cover")), duration_sec=duration,
                          animation=clip.get("animation"), transform=clip.get("transform"), fps=fps)
    vf = vf.replace("1920", str(width)).replace("1080", str(height))
    # Preserve positioning for cropped zooms and translated objects: ordinary pad
    # rejects a scaled image larger than its target canvas.
    t = clip.get("transform") or {}
    dx = (float(t.get("x", 50)) - 50) * width / 100
    dy = (float(t.get("y", 50)) - 50) * height / 100
    vf = re.sub(r"pad=" + str(width) + r":" + str(height) + r":\([^,]+?:black",
        f"pad=w='max(iw,{width}+{abs(dx)*2})':h='max(ih,{height}+{abs(dy)*2})':"
        f"x='(ow-iw)/2':y='(oh-ih)/2':color=black,"
        f"crop={width}:{height}:'(iw-{width})/2-{dx}':'(ih-{height})/2-{dy}'", vf)
    # Every source frame produces exactly one output frame, including footage.
    vf = vf.replace(f":d={max(1, int(round(duration * fps)))}:", ":d=1:")
    if transparent:
        vf = vf.replace(":black", ":black@0").replace("color=black", "color=black@0").replace("c=black", "c=black@0")
        vf = re.sub(r"(fade=t=(?:in|out):st=[^,]+)", r"\1:alpha=1", vf)
    effects = visual_filter(clip.get("visual_effects"), width, height, fps)
    return f"fps={fps},format={'rgba' if transparent else 'yuv420p'},{vf}," + (effects + "," if effects else "") + f"setsar=1,settb=1/{fps},setpts=PTS-STARTPTS,fps={fps}"


def file_digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def cache_identity(value):
    """Baked 3D sources have content keys; temporary job paths must not spoil reuse."""
    if isinstance(value, str):
        path = Path(value)
        if path.parent.name == "three" and re.fullmatch(r"[0-9a-f]{64}\.mp4", path.name):
            return "three:" + path.stem
        return value
    if isinstance(value, list):
        return [cache_identity(v) for v in value]
    if isinstance(value, dict):
        return {cache_identity(k): cache_identity(v) for k, v in value.items()}
    return value


def graphics_runtime_digest() -> str:
    root = Path(__file__).resolve().parents[4]
    files = sorted((root / "packages/video-engine/src").glob("*.ts"))
    files += sorted((root / "packages/shared-types/src").glob("*.json"))
    files += sorted((root / "packages/video-engine/fonts").glob("*.ttf"))
    files.append(root / "render-service/src/native/render-graphics.ts")
    return hashlib.sha256("".join(file_digest(p) for p in files if p.is_file()).encode()).hexdigest()


def graphics_command() -> list[str]:
    if settings.render_graphics_command:
        return shlex.split(settings.render_graphics_command, posix=os.name != "nt")
    root = Path(__file__).resolve().parents[4]
    cli = root / "render-service/src/native/render-graphics.ts"
    tsx = root / "render-service/node_modules/tsx/dist/cli.mjs"
    if not cli.is_file() or not tsx.is_file():
        raise RuntimeError("Shared graphics runtime unavailable. Install workspace Node dependencies "
                           "or configure RENDER_GRAPHICS_COMMAND; captions will not be silently omitted.")
    return ["node", str(tsx), str(cli)]


def _active(items: list[dict], start: float, end: float) -> list[dict]:
    return [g for g in items if float(g.get("start_sec", 0)) < end
            and float(g.get("start_sec", 0)) + float(g.get("duration_sec", 0)) > start]


def render_section(clip: dict, next_clip: dict | None, transition: dict | None,
                   manifest: dict, staged: dict[str, Path], directory: Path,
                   runner: Runner, encoder: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    fps = int(manifest["metadata"]["fps"])
    width, height = (int(manifest["metadata"]["resolution"][k]) for k in ("width", "height"))
    start = float(clip["start_sec"])
    duration = float(clip["duration_sec"])
    frames = max(1, round((start + duration) * fps) - round(start * fps))
    end = start + frames / fps
    settings_manifest = manifest.get("settings", {})
    captions = _active(manifest["tracks"].get("captions", []), start, end) if settings_manifest.get("captions_enabled", True) else []
    graphics = _active(manifest.get("graphics", []), start, end)
    overlays = _active(manifest.get("overlays", []), start, end)
    broll = _active(manifest["tracks"].get("broll", []), start, end)
    graphics_manifest = {**manifest, "graphics": graphics, "overlays": overlays,
                         "tracks": {**manifest["tracks"], "captions": captions}}
    involved = {str(c["src"]) for c in [clip, *( [next_clip] if next_clip else []), *broll, *graphics] if c.get("src")}
    if settings_manifest.get("background_image"):
        involved.add(str(settings_manifest["background_image"]))
    for overlay in overlays:
        involved.update(str(src) for src in overlay.get("image_refs", []) if src)
        involved.update(str(layer["src"]) for layer in (overlay.get("scene") or {}).get("layers", []) if layer.get("src"))
    digests = {src: file_digest(staged[src]) for src in involved}
    fingerprint = hashlib.sha256(json.dumps(cache_identity({"engine": ENGINE_VERSION, "clip": clip,
        "next": next_clip, "transition": transition, "broll": broll, "graphics": graphics_manifest.get("graphics"),
        "overlays": overlays, "captions": captions, "settings": settings_manifest, "files": digests,
        "fps": fps, "size": [width, height], "encoder": encoder,
        "graphics_runtime": graphics_runtime_digest()}), sort_keys=True).encode()).hexdigest()
    cache = Path(settings.render_cache_dir) if settings.render_cache_dir else None
    out = directory / "section.mp4"
    if cache and section_cache.load(cache, fingerprint, out):
        (directory / "profile.json").write_text(json.dumps({"clip": clip["id"], "cache_hit": True,
            "total_sec": time.perf_counter() - started}), encoding="utf-8")
        return out

    # Decode, transform, transition and composite in one bounded FFmpeg process.
    # No lossless full-video intermediates are written or decoded again.
    background = settings_manifest.get("background_image")
    template_slot = None
    if clip.get("motion_template"):
        template_request = directory / "template.json"
        template_request.write_text(json.dumps({"manifest": {**manifest, "tracks": {**manifest["tracks"], "video": [clip]}},
            "width": width, "height": height, "outputDir": str(directory)}), encoding="utf-8")
        runner.run([*graphics_command(), str(template_request), "--template-background"])
        template_slot = json.loads((directory / "template-slot.json").read_text(encoding="utf-8"))
        back_args = source_args({"type": "image"}, directory / "template-background.png", fps)
    elif background:
        back_args = source_args({"type": "image"}, staged[background], fps)
    else:
        color = str(settings_manifest.get("background_color") or "#000000")
        back_args = ["-f", "lavfi", "-i", f"color=c={color}:s={width}x{height}:r={fps}"]
    media_filter = clip_filter(clip, duration, width, height, fps, transparent=True)
    background_filter = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,settb=1/{fps}"
    graph = f"[0:v]{media_filter},tpad=stop_mode=clone:stop_duration={duration}[source];[1:v]{background_filter}[back];[back][source]overlay=shortest=1:format=auto,format=yuv420p[out]"
    if template_slot:
        slot = template_slot
        sw = max(2, round(slot["width"] * slot["scaleX"] * width / 1920 / 2) * 2)
        sh = max(2, round(slot["height"] * slot["scaleY"] * height / 1080 / 2) * 2)
        x = (slot["x"] + slot["offsetX"]) * width / 1920 + (slot["width"] * width / 1920 - sw) / 2
        y = (slot["y"] + slot["offsetY"]) * height / 1080 + (slot["height"] * height / 1080 - sh) / 2
        vf = f"fps={fps},scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={sw}:{sh},format=rgba,setsar=1,setpts=PTS-STARTPTS"
        if slot.get("grayscale"):
            vf += ",hue=s=0"
        effects = visual_filter(clip.get("visual_effects"), sw, sh, fps)
        if effects:
            vf += "," + effects
        if slot.get("hidden"):
            vf += ",colorchannelmixer=aa=0"
        else:
            alpha = "1-pow(1-clip((T-.52)/.7,0,1),3)"
            if slot.get("radius"):
                alpha += f"*lte(pow((X-{sw}/2)/({sw}/2),2)+pow((Y-{sh}/2)/({sh}/2),2),1)"
            vf += f",geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*({alpha})'"
        # tpad also consumes link frame_rate to calculate its cloned-frame count.
        vf += f",fps={fps},tpad=stop_mode=clone:stop_duration={duration},settb=1/{fps}"
        dy = 32 * height / 1080
        graph = f"[0:v]{vf}[source];[1:v]{background_filter}[back];[back][source]overlay=x={x:.6f}:y='{y:.6f}+{dy:.6f}*pow(1-clip((t-.52)/.7,0,1),3)':shortest=1:format=auto,format=yuv420p[out]"
    inputs = [*source_args(clip, staged[clip["src"]], fps), *back_args]
    parts: list[str] = [graph.replace("[out]", "[base0]")]
    last = "[base0]"
    next_input = 2
    media_done = time.perf_counter()
    if transition and next_clip and transition.get("enabled", True) and transition.get("type") != "cut":
        d = min(float(transition.get("duration_sec") or 0), duration / 2, float(next_clip["duration_sec"]) / 2)
        if d > 1 / fps:
            # The incoming template's frame zero has no visible footage yet.
            # Hold its authored plate rather than revealing the raw source.
            if next_clip.get("motion_template"):
                peek_dir = directory / "incoming-template"
                peek_dir.mkdir()
                peek_request = peek_dir / "request.json"
                peek_request.write_text(json.dumps({"manifest": {**manifest, "tracks": {**manifest["tracks"], "video": [next_clip]}},
                    "width": width, "height": height, "templateLocalSec": 0, "outputDir": str(peek_dir)}), encoding="utf-8")
                runner.run([*graphics_command(), str(peek_request), "--template-background"])
                peek_args = source_args({"type": "image"}, peek_dir / "template-background.png", fps)
                peek_filter = f"scale={width}:{height},setsar=1,settb=1/{fps}"
            else:
                peek_args = source_args(next_clip, staged[next_clip["src"]], fps)
                peek_filter = clip_filter({**next_clip, "animation": None}, d, width, height, fps)
            inputs.extend(peek_args)
            # Transform/framesync filters can clear the link's frame-rate metadata.
            # xfade requires matching constant rates and time bases on both final
            # inputs, even when earlier source filters already normalized them.
            # Keep fps last: FFmpeg 7.x setpts itself clears frame_rate metadata.
            clock = f"settb=1/{fps},setpts=PTS-STARTPTS,fps={fps}"
            parts.append(f"[{next_input}:v]{peek_filter},trim=end_frame=1,tpad=stop_mode=clone:stop_duration={d + 1},format=yuv420p,{clock}[peek]")
            parts.append(f"{last}{clock}[transitionout]")
            next_input += 1
            typ = normalize_transition_type(str(transition["type"]))
            name = "fadeblack" if typ == "film-burn" else "dissolve" if typ == "glitch" else map_xfade_name(typ)
            xf = f"[transitionout][peek]xfade=transition={name}:duration={d:.6f}:offset={duration - d:.6f}"
            if typ in {"film-burn", "glitch"}:
                effect = "eq=saturation=1.55:brightness=0.06:contrast=1.2,vignette=PI/3.5,noise=alls=18:allf=t+u:all_seed=42" if typ == "film-burn" else "noise=alls=40:allf=t+u:all_seed=42,rgbashift=rh=8:gh=-5:bv=6"
                xf += f"[xf];[xf]split[original][fx];[fx]{effect}[effect];[original][effect]overlay=enable='gte(t,{duration-d:.6f})'"
            xf += ",format=yuv420p[transitionbase]"
            parts.append(xf)
            last = "[transitionbase]"
    transition_done = time.perf_counter()

    for i, item in enumerate(broll):
        rel = max(0.0, start - float(item["start_sec"]))
        local = {**item, "source_start_sec": float(item.get("source_start_sec") or 0) + rel}
        inputs.extend(source_args(local, staged[item["src"]], fps))
        t = item.get("transform") or {}
        sx, sy = (max(0.05, float(t.get(k, 1))) for k in ("scaleX", "scaleY"))
        w, h = max(2, int(width * sx / 2) * 2), max(2, int(height * sy / 2) * 2)
        at = max(0.0, float(item["start_sec"]) - start)
        stop = min(duration, float(item["start_sec"]) + float(item["duration_sec"]) - start)
        parts.append(f"[{next_input}:v]fps={fps},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
                     + (visual_filter(item.get("visual_effects"), w, h, fps) + "," if item.get("visual_effects") else "")
                     + f"setsar=1,setpts=PTS-STARTPTS+{at:.6f}/TB[b{i}]")
        x, y = float(t.get("x", 50)) / 100, float(t.get("y", 50)) / 100
        label = f"[bbase{i}]"
        parts.append(f"{last}[b{i}]overlay=x=W*{x}-w/2:y=H*{y}-h/2:eof_action=pass:"
                     f"enable='gte(t,{at:.6f})*lt(t,{stop:.6f})'{label}")
        last = label
        next_input += 1

    graphics_process: list[str] | None = None
    if captions or graphics or overlays or clip.get("motion_template"):
        frame_dir = directory / "graphics"
        request = directory / "graphics.json"
        request.write_text(json.dumps({"manifest": graphics_manifest, "startFrame": round(start * fps),
            "frameCount": frames, "width": width, "height": height, "fps": fps,
            "assetPaths": {key: str(path) for key, path in staged.items()}, "outputDir": str(frame_dir)}), encoding="utf-8")
        graphics_process = [*graphics_command(), str(request), "--raw"]
        idx = next_input
        inputs.extend(["-f", "rawvideo", "-pixel_format", "rgba", "-video_size", f"{width}x{height}",
                       "-framerate", str(fps), "-i", "pipe:0"])
        parts.append(f"{last}[{idx}:v]overlay=eof_action=pass:shortest=1[graphicbase]")
        last = "[graphicbase]"
    parts.append(f"{last}format=yuv420p[out]")
    script = directory / "compose.txt"
    script.write_text(";".join(parts), encoding="utf-8")
    compose_args = [*inputs, "-filter_complex_script", str(script), "-map", "[out]", "-an",
                   "-frames:v", str(frames), "-r", str(fps), *encoding_args(encoder),
                   "-pix_fmt", "yuv420p", "-video_track_timescale", str(fps * 1000), str(out)]
    if graphics_process:
        runner.graphics_pipe(graphics_process, compose_args)
    else:
        runner.ffmpeg(compose_args)
    video = next((stream for stream in probe(out).get("streams", []) if stream.get("codec_type") == "video"), {})
    if int(video.get("nb_frames", 0)) != frames:
        raise RuntimeError(f"Section {clip['id']} encoded {video.get('nb_frames', 0)} frames; expected {frames}")
    composed = time.perf_counter()
    if cache:
        section_cache.save(cache, fingerprint, out, settings.render_cache_max_bytes, settings.render_cache_ttl_sec)
    # Each completed section releases intermediate frames and lossless files.
    profile = directory / "profile.json"
    profile.write_text(json.dumps({"clip": clip["id"], "cache_hit": False,
        "prepare_sec": media_done - started, "transition_sec": transition_done - media_done,
        "graphics_composition_encoding_sec": composed - transition_done,
        "total_sec": composed - started}), encoding="utf-8")
    for child in directory.iterdir():
        if child not in (out, profile):
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
    return out


def mix_audio(manifest: dict, staged: dict[str, Path], directory: Path, runner: Runner, *, cue_manifest: dict | None = None) -> Path:
    """Absolute-time narration, music/SFX, original footage, and synthesized cues."""
    duration = float(manifest["metadata"]["duration_sec"])
    opts = manifest.get("settings", {})
    entries: list[tuple[Path, dict, float, str]] = []
    for bus, gain in (("audio", opts.get("narration_volume", 1)), ("music", opts.get("music_volume", 0.28))):
        for clip in manifest["tracks"].get(bus, []):
            volume = opts.get("sfx_volume", 0.5) if clip.get("mood") == "sfx" else gain
            entries.append((staged[clip["src"]], clip, float(volume),
                            "dialogue" if bus == "audio" else "sfx" if clip.get("mood") == "sfx" else "music"))
    for bus in ("video", "broll"):
        for clip in manifest["tracks"].get(bus, []):
            if clip.get("type") == "video" and not clip.get("muted", False):
                path = staged[clip["src"]]
                if any(s["codec_type"] == "audio" for s in probe(path).get("streams", [])):
                    entries.append((path, clip, float(opts.get("clip_audio_volume", 1)), "dialogue"))
    # Preview and export share the same cue selection, timing, and sound files.
    cue_request = directory / "audio-cue-request.json"
    cue_request.write_text(json.dumps({"manifest": cue_manifest or manifest, "outputDir": str(directory)}), encoding="utf-8")
    runner.run([*graphics_command(), str(cue_request), "--audio-cues"])
    root = Path(__file__).resolve().parents[4]
    for cue in json.loads((directory / "audio-cues.json").read_text(encoding="utf-8")):
        name = cue["file"]
        if Path(name).name != name:
            raise ValueError("Invalid cue sound path")
        path = root / "render-service/static/sfx" / name
        if not path.is_file():
            path = root / "apps/web/public/sfx" / name
        if not path.is_file():
            raise RuntimeError(f"Bundled sound unavailable: {name}")
        entries.append((path, {"start_sec": cue["startSec"], "duration_sec": cue["durationSec"], "volume": cue["gain"], "source_start_sec": cue.get("sourceStartSec", 0)},
                        float(opts.get("sfx_volume", .5)), "sfx"))
    inputs = ["-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={duration}"]
    parts, labels = [], ["[0:a]"]
    buses: dict[str, list[str]] = {"dialogue": [], "music": [], "sfx": []}
    for i, (path, clip, bus_volume, bus) in enumerate(entries, start=1):
        inputs.extend(["-i", str(path)])
        source = max(0.0, float(clip.get("source_start_sec") or 0))
        d = float(clip["duration_sec"])
        delay = round(float(clip["start_sec"]) * 48000)
        volume = 0 if clip.get("muted") else bus_volume * float(clip.get("volume", 1))
        chain = [f"atrim=start={source:.6f}:duration={d:.6f}", "asetpts=PTS-STARTPTS",
                 "aformat=sample_rates=48000:channel_layouts=stereo", f"volume={volume:.6f}"]
        for mode in ("in", "out"):
            fade = min(d, max(0.0, float(clip.get(f"fade_{mode}_sec") or 0)))
            if fade:
                chain.append(f"afade=t={mode}:st={0 if mode=='in' else d-fade:.6f}:d={fade:.6f}")
        chain.append(f"adelay={delay}S:all=1")
        parts.append(f"[{i}:a]{','.join(chain)}[a{i}]")
        buses[bus].append(f"[a{i}]")
    for bus, members in buses.items():
        if members:
            parts.append(f"{''.join(members)}amix=inputs={len(members)}:normalize=0:duration=longest[{bus}]")
    if buses["dialogue"] and buses["music"]:
        parts.append("[dialogue]asplit=2[dialogueout][duckkey]")
        parts.append("[music][duckkey]sidechaincompress=threshold=0.018:ratio=5:attack=15:release=250[ducked]")
        labels.extend(["[dialogueout]", "[ducked]"])
    else:
        labels.extend(f"[{bus}]" for bus in ("dialogue", "music") if buses[bus])
    if buses["sfx"]:
        labels.append("[sfx]")
    parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,"
                 f"alimiter=limit=0.95:level=0:latency=1,atrim=duration={duration:.6f}[out]")
    script = directory / "audio.txt"
    script.write_text(";".join(parts), encoding="utf-8")
    out = directory / "mix.wav"
    runner.ffmpeg([*inputs, "-filter_complex_script", str(script), "-map", "[out]",
                   "-t", str(duration), "-c:a", "pcm_s16le", str(out)])
    return out


def render_manifest_native(manifest: dict, work_dir: Path, *, on_progress: Progress | None = None,
                           cancel_event: threading.Event | None = None) -> Path:
    runner = Runner(cancel_event)
    emit = on_progress or (lambda percent, message: None)
    work_dir.mkdir(parents=True, exist_ok=True)
    duration = float(manifest["metadata"]["duration_sec"])
    from src.render.three_pipeline import prepare_three_clips
    from src.render.html_pipeline import prepare_html_clips
    encoder = select_encoder(settings.render_encoder)
    cue_manifest = manifest
    manifest = prepare_html_clips(manifest, work_dir, runner, encoder, emit)
    manifest = prepare_three_clips(manifest, work_dir, runner, encoder, emit)
    clips = sorted(manifest["tracks"]["video"], key=lambda c: float(c["start_sec"]))
    # Gaps are black sections. Overlapping base clips are ambiguous; b-roll is the layer track.
    sections, cursor = [], 0.0
    gap_src = str((manifest.get("settings") or {}).get("background_image") or "__black__")
    for clip in clips:
        at = float(clip["start_sec"])
        if at < cursor - 1 / int(manifest["metadata"]["fps"]):
            raise ValueError("Overlapping main video clips are unsupported; place overlays on broll")
        if at > cursor + 0.001:
            sections.append({"id": f"gap-{len(sections)}", "type": "image", "src": gap_src,
                             "start_sec": cursor, "duration_sec": at - cursor})
        sections.append(clip)
        cursor = at + float(clip["duration_sec"])
    if cursor < duration - .001:
        sections.append({"id": "gap-end", "type": "image", "src": gap_src, "start_sec": cursor,
                         "duration_sec": duration - cursor})
    emit(6, "Preparing source assets")
    assets_dir = work_dir / "assets"
    assets_dir.mkdir(exist_ok=True)
    staged = stage_assets(manifest, assets_dir)
    if any(c["src"] == "__black__" for c in sections):
        black = assets_dir / "black.png"
        color = str((manifest.get("settings") or {}).get("background_color") or "#000000")
        runner.ffmpeg(["-f", "lavfi", "-i", f"color=c={color}:s=64x64", "-frames:v", "1", str(black)])
        staged["__black__"] = black
    emit(8, f"Rendering sections ({encoder})")
    transitions = {t["after_clip_id"]: t for t in manifest.get("transitions", [])}
    paths: dict[int, Path] = {}
    concurrency = max(1, min(8, settings.render_parallel_sections))
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(render_section, clip, sections[i+1] if i+1 < len(sections) else None,
            transitions.get(clip["id"]), manifest, staged, work_dir / f"section-{i}", runner, encoder): i
            for i, clip in enumerate(sections)}
        try:
            for future in as_completed(futures):
                paths[futures[future]] = future.result()
                emit(8 + round(75 * len(paths) / len(sections)), f"Rendered {len(paths)}/{len(sections)} sections")
        except BaseException:
            runner.cancel.set()
            raise
    emit(86, "Mixing audio and sound cues")
    audio = mix_audio(manifest, staged, work_dir, runner, cue_manifest=cue_manifest)
    listing = work_dir / "sections.txt"
    listing.write_text("\n".join("file '" + paths[i].resolve().as_posix().replace("'", "'\\''") + "'"
                                  for i in range(len(sections))), encoding="utf-8")
    out = work_dir / "final.mp4"
    emit(94, "Assembling video")
    runner.ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(duration), "-movflags", "+faststart", str(out)])
    emit(98, "Export complete")
    return out
