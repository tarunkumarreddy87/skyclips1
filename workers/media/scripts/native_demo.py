"""Reproducible 1080p30 graphics/export proof using generated source footage.

Run from the repo root with PYTHONPATH=workers/media and Python 3.12. No cloud
storage, AI service, external media downloads, or paid API is used.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from src.config import settings
from src.render.ffmpeg_pipeline import render_manifest, validate_manifest
from src.render.native_pipeline import probe, select_encoder, graphics_runtime_digest


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def main() -> None:
    root = Path(__file__).resolve().parents[3]
    proofs = root / "workers/media/proofs"
    proofs.mkdir(exist_ok=True)
    settings.render_encoder = "auto"
    settings.render_parallel_sections = 2
    with tempfile.TemporaryDirectory(prefix="hanuman-native-proof-") as tmp:
        directory = Path(tmp)
        source = directory / "source.mp4"
        image = directory / "image.jpg"
        music = directory / "music.wav"
        run("-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=5", "-f", "lavfi", "-i",
            "sine=frequency=440:sample_rate=48000:duration=5", "-vf", "eq=saturation=.45:brightness=-.08",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-shortest", str(source))
        run("-ss", "1", "-i", str(source), "-frames:v", "1", str(image))
        run("-f", "lavfi", "-i", "sine=frequency=110:sample_rate=48000:duration=12",
            "-af", "volume=.18", str(music))
        manifest = {
            "version": "1", "metadata": {"project_id": "11111111-1111-4111-8111-111111111111",
                "run_id": "22222222-2222-4222-8222-222222222222", "format_mode": "documentary",
                "resolution": {"width": 1920, "height": 1080}, "fps": 30, "duration_sec": 12},
            "tracks": {"video": [
                {"id": "v0", "scene_id": "s0", "type": "video", "src": str(source), "start_sec": 0,
                 "source_start_sec": .5, "duration_sec": 4, "muted": False, "fit": "cover",
                 "transform": {"scaleX": .48, "scaleY": .48, "x": 50, "y": 45}},
                {"id": "v1", "scene_id": "s1", "type": "image", "src": str(image), "start_sec": 4,
                 "duration_sec": 4, "fit": "cover", "transform": {"scaleX": .48, "scaleY": .48, "x": 25, "y": 48}},
                {"id": "v2", "scene_id": "s2", "type": "video", "src": str(source), "start_sec": 8,
                 "source_start_sec": 1, "duration_sec": 4, "muted": True, "fit": "cover",
                 "transform": {"scaleX": .35, "scaleY": .35, "x": 75, "y": 48}},
            ], "audio": [], "music": [{"id": "music", "type": "music", "src": str(music),
                "start_sec": 0, "duration_sec": 12, "volume": .2, "fade_in_sec": .5, "fade_out_sec": .6}],
                "captions": [
                {"id": "cap0", "section_id": "s0", "text": "Our own engine. One shared scene.", "start_sec": .6, "duration_sec": 2.7,
                    "words": [{"text": word, "start_sec": .6+i*.45, "duration_sec": .45} for i,word in enumerate("Our own engine. One shared scene.".split())]},
                {"id": "cap1", "section_id": "s1", "text": "Frames move. Data comes to life.", "start_sec": 4.5, "duration_sec": 2.7,
                    "words": [{"text": word, "start_sec": 4.5+i*.45, "duration_sec": .45} for i,word in enumerate("Frames move. Data comes to life.".split())]},
                {"id": "cap2", "section_id": "s2", "text": "Exact timing. A complete sound mix.", "start_sec": 8.5, "duration_sec": 2.7,
                    "words": [{"text": word, "start_sec": 8.5+i*.45, "duration_sec": .45} for i,word in enumerate("Exact timing. A complete sound mix.".split())]},
                ], "broll": []},
            "settings": {"caption_style": "clean_highlight", "theme_id": "modern", "background_color": "#0b101a",
                "overlay_drop_shadow": True, "captions_enabled": True, "clip_audio_volume": .12,
                "music_volume": .2, "sfx_volume": .18},
            "transitions": [{"id": "t0", "after_clip_id": "v0", "type": "dissolve", "duration_sec": .4, "enabled": True},
                            {"id": "t1", "after_clip_id": "v1", "type": "wipeleft", "duration_sec": .4, "enabled": True}],
            "overlays": [{"id": "title", "type": "freeform_text", "text": "THE HANUMAN ENGINE", "start_sec": .2,
                "duration_sec": 11.5, "transform": {"x": 50, "y": 13}, "style": {"font_size_px": 52,
                "font_family": "montserrat", "font_weight": "700"}, "animation": {"in": {"preset": "float", "duration_sec": .45}}}],
            "graphics": [
                {"id": "frame", "type": "frame", "src": str(image), "text": "SOURCE / 01", "start_sec": .4, "duration_sec": 7.1,
                 "width_pct": 27, "height_pct": 32, "transform": {"x": 77, "y": 46},
                 "keyframes": [{"time_sec": 0, "x": 77, "rotation": 3, "scale": .8},
                               {"time_sec": 1, "x": 77, "rotation": 0, "scale": 1},
                               {"time_sec": 4, "x": 24, "rotation": -3, "scale": 1}]},
                {"id": "chart", "type": "bar_chart", "text": "ILLUSTRATIVE DATA", "start_sec": 4.1, "duration_sec": 7.4,
                 "width_pct": 43, "height_pct": 42, "color": "#67d7f0", "transform": {"x": 68, "y": 49},
                 "data": [{"label": "Research", "value": 72}, {"label": "Composition", "value": 90}, {"label": "Sound", "value": 64}],
                 "keyframes": [{"time_sec": 0, "x": 68}, {"time_sec": 3.5, "x": 68}, {"time_sec": 4.2, "x": 28}]},
                {"id": "shape", "type": "shape", "shape": "circle", "color": "#67d7f0", "start_sec": .3, "duration_sec": 11.4,
                 "width_pct": 2, "height_pct": 3.55, "transform": {"x": 12, "y": 72},
                 "keyframes": [{"time_sec": 0, "x": 12, "opacity": .3}, {"time_sec": 3, "x": 87, "opacity": .9},
                               {"time_sec": 7, "x": 12, "opacity": .9}, {"time_sec": 10, "x": 87, "opacity": .3}]},
            ],
        }
        validate_manifest(manifest)
        settings.render_cache_dir = str(directory / "cache")
        runtime_before = graphics_runtime_digest()
        start = time.perf_counter()
        cold = render_manifest(manifest, directory / "cold", on_progress=lambda percent,message: print(f"{percent}% {message}", flush=True))
        cold_sec = time.perf_counter() - start
        cold_profiles = [json.loads(path.read_text(encoding="utf-8")) for path in sorted((directory / "cold").glob("section-*/profile.json"))]
        shutil.copyfile(cold, proofs / "native-engine-demo.mp4")
        start = time.perf_counter()
        render_manifest(manifest, directory / "warm")
        warm_sec = time.perf_counter() - start
        warm_profiles = [json.loads(path.read_text(encoding="utf-8")) for path in sorted((directory / "warm").glob("section-*/profile.json"))]
        runtime_after = graphics_runtime_digest()
        if runtime_before != runtime_after:
            raise RuntimeError("Graphics runtime changed during benchmark; rerun against a stable engine")
        if not warm_profiles or not all(section["cache_hit"] for section in warm_profiles):
            raise RuntimeError("Warm export did not reuse every section; it is not a valid unchanged-cache benchmark")
        info = probe(cold)
        stream = next(s for s in info["streams"] if s["codec_type"] == "video")
        metrics = {"cold_sec": round(cold_sec, 3), "cached_sec": round(warm_sec, 3), "duration_sec": info["format"]["duration"],
                   "width": stream["width"], "height": stream["height"], "fps": stream["r_frame_rate"], "frames": stream["nb_frames"],
                   "encoder": select_encoder(settings.render_encoder),
                   "parallel_sections": settings.render_parallel_sections, "ffmpeg_threads": settings.render_ffmpeg_threads,
                   "logical_cpu_count": os.cpu_count(), "platform": platform.platform(),
                   "cold_render_seconds_per_video_second": round(cold_sec / 12, 3),
                   "cached_render_seconds_per_video_second": round(warm_sec / 12, 3),
                   "graphics_runtime_sha256": runtime_before,
                   "note": "Local synthetic footage; not a comparative or cloud benchmark."}
        metrics["cold_sections"] = cold_profiles
        metrics["cached_sections"] = warm_profiles
        (proofs / "native-engine-demo.metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        (proofs / "native-engine-demo.manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        for at in (1.8, 5.8, 9.8):
            run("-ss", str(at), "-i", str(cold), "-frames:v", "1", str(proofs / f"native-demo-{at}.png"))
        print(json.dumps(metrics), flush=True)


if __name__ == "__main__":
    main()
