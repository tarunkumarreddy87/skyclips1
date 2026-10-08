"""Reproducible offline 1080p mixed documentary proof; no project changes or paid APIs."""
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from src.config import settings
from src.render.native_pipeline import render_manifest_native, probe
from src.render.ffmpeg_pipeline import validate_manifest

root = Path(__file__).resolve().parents[3]
proof_root = root / "workers/media/proofs/three-mixed"
directory = proof_root / time.strftime("%Y%m%dT%H%M%S")
directory.mkdir(parents=True, exist_ok=True)
scene = {"version": 1, "background": "#080e1e", "camera": {"position": [0, 1, 6], "orbitSpeed": .12},
         "objects": [{"id": "globe", "geometry": "sphere", "color": "#38bdf8", "wireframe": True, "spin": [0, .2, 0]},
                     {"id": "ring", "geometry": "torus", "color": "#fbbf24", "rotation": [1.1, .2, .2], "scale": [1.6, 1.6, 1.6]}]}
tone = directory / "tone.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", str(tone)], check=True)
manifest = {"version": "1", "metadata": {"project_id": "00000000-0000-4000-8000-000000000001", "run_id": "00000000-0000-4000-8000-000000000002",
    "format_mode": "documentary", "resolution": {"width": 1920, "height": 1080}, "fps": 30, "duration_sec": 6},
    "tracks": {"video": [
        {"id": "intro", "scene_id": "s1", "type": "image", "src": "color:#192b44", "start_sec": 0, "duration_sec": 2},
        {"id": "three", "scene_id": "s2", "type": "image", "src": "color:#000000", "start_sec": 2, "duration_sec": 2, "three_scene": scene},
        {"id": "outro", "scene_id": "s3", "type": "image", "src": "color:#152238", "start_sec": 4, "duration_sec": 2}],
        "audio": [{"id": "narration", "type": "narration", "src": str(tone), "start_sec": 0, "duration_sec": 6, "volume": .15}],
        "captions": [{"id": "caption", "section_id": "s2", "text": "Three.js in a documentary timeline", "start_sec": 2.2, "duration_sec": 1.6}], "broll": [], "music": []},
    "transitions": [{"id": "t1", "after_clip_id": "intro", "type": "dissolve", "duration_sec": .4, "enabled": True},
                    {"id": "t2", "after_clip_id": "three", "type": "fade", "duration_sec": .4, "enabled": True}],
    "settings": {"captions_enabled": True, "caption_style": "cinematic", "sfx_volume": .2}}
settings.render_encoder = "auto"
validate_manifest(manifest)
settings.render_cache_dir = str(directory / "cache")
metrics = {"resolution": [1920, 1080], "fps": 30, "duration_sec": 6}
for name in ("cold", "warm"):
    started = time.perf_counter()
    output = render_manifest_native(manifest, directory / name, on_progress=lambda percent, text: print(f"{percent}% {text}", flush=True))
    metrics[f"{name}_sec"] = time.perf_counter() - started
    info = probe(output)
    stream = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert int(stream["nb_frames"]) == 180
    assert any(s["codec_type"] == "audio" for s in info["streams"])
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "-"], check=True)
shutil.copyfile(directory / "cold/final.mp4", proof_root / "mixed-1080p.mp4")
metrics["three"] = json.loads((directory / "cold/three/metrics.json").read_text()) if (directory / "cold/three/metrics.json").exists() else {"cache_hit": True}
if "--service" in sys.argv:
    # Run inside render-service: exercises queue, progress, native_cli and artifact upload.
    import httpx
    from src.pipeline.storage import download_file
    settings.s3_bucket = os.getenv("S3_BUCKET_NAME", settings.s3_bucket)
    proof_id = str(uuid.uuid4())
    output_key = f"proofs/three/{proof_id}.mp4"
    started = time.perf_counter()
    with httpx.Client(base_url="http://127.0.0.1:8081", headers={"x-api-key": os.getenv("RENDER_SERVICE_API_KEY", "")}, timeout=30) as client:
        response = client.post("/render/start", json={"manifest": manifest, "outputKey": output_key,
            "projectId": manifest["metadata"]["project_id"], "runId": proof_id, "externalId": f"three-proof-{proof_id}"})
        response.raise_for_status()
        render_id = response.json()["renderId"]
        previous = None
        while time.perf_counter() - started < 600:
            response = client.get(f"/render/{render_id}/status")
            response.raise_for_status()
            job = response.json()["job"]
            state = (job["status"], job["progress"], job["message"])
            if state != previous:
                print(f"Service: {state}", flush=True)
                previous = state
            if job["status"] in ("completed", "failed", "cancelled"):
                break
            time.sleep(1)
        else:
            client.delete(f"/render/{render_id}").raise_for_status()
            raise RuntimeError("Three.js service proof exceeded ten minutes and was cancelled")
        if job["status"] != "completed":
            raise RuntimeError(f"Service proof failed: {job.get('error')}")
        response = client.get(f"/render/{render_id}/result")
        response.raise_for_status()
        assert response.json()["job"].get("outputUrl"), "Missing final artifact URL"
    uploaded = proof_root / "service-1080p.mp4"
    download_file(output_key, uploaded)
    stream = next(s for s in probe(uploaded)["streams"] if s["codec_type"] == "video")
    assert int(stream["nb_frames"]) == 180
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(uploaded), "-f", "null", "-"], check=True)
    metrics["service"] = {"render_id": render_id, "status": job["status"], "encoder": job["encoder"],
                          "elapsed_sec": time.perf_counter() - started, "frames": 180}
(directory / "metrics.json").write_text(json.dumps(metrics, indent=2))
(proof_root / "metrics.json").write_text(json.dumps(metrics, indent=2))
print(json.dumps(metrics), flush=True)
