"""Phase 5: hydrate Indian Fighters timeline and render via Remotion bridge (no Temporal)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import boto3
from botocore.client import Config

REPO = Path(__file__).resolve().parents[1]
MANIFEST_IN = REPO / "packages" / "remotion-renderer" / "out" / "indian-fighters-manifest.json"
OUT_DIR = REPO / "packages" / "remotion-renderer" / "proofs"
OUT_MP4 = OUT_DIR / "phase5-indian-fighters.mp4"
JOB_PATH = REPO / "packages" / "remotion-renderer" / "out" / "phase5-job.json"
LOG_PATH = REPO / "scripts" / "_phase5_bridge.log"

S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "http://localhost:9000")
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", "minioadmin")
S3_BUCKET = os.environ.get("S3_BUCKET", "hanuman-artifacts")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")
CHROME = os.environ.get(
    "REMOTION_BROWSER_EXECUTABLE",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
)


def s3():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def presign(client, key: str, expires: int = 14400) -> str:
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def hydrate(manifest: dict) -> dict:
    client = s3()
    tracks = manifest.get("tracks", {})
    for track in ("video", "audio", "broll", "music"):
        for clip in tracks.get(track, []):
            src = clip.get("src")
            if not isinstance(src, str) or not src:
                continue
            if src.startswith(("http://", "https://", "color:", "static:")):
                continue
            clip["src"] = presign(client, src)
    return manifest


def main() -> int:
    if not MANIFEST_IN.is_file():
        print(f"missing manifest {MANIFEST_IN}", file=sys.stderr)
        return 1

    manifest = hydrate(json.loads(MANIFEST_IN.read_text(encoding="utf-8")))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_MP4.exists():
        OUT_MP4.unlink()

    job = {
        "engine": "remotion-local",
        "manifest": manifest,
        "outputPath": str(OUT_MP4),
    }
    if Path(CHROME).is_file():
        job["browserExecutable"] = CHROME
    JOB_PATH.write_text(json.dumps(job), encoding="utf-8")

    pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd")
    if not pnpm:
        print("pnpm not found", file=sys.stderr)
        return 1

    cmd = [pnpm, "exec", "tsx", "src/bridge/job.ts", f"--job={JOB_PATH}"]
    print(f"starting bridge duration={manifest['metadata']['duration_sec']}s", flush=True)
    print(f"cmd={' '.join(cmd)}", flush=True)
    t0 = time.time()

    with LOG_PATH.open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(
            cmd,
            cwd=str(REPO / "packages" / "remotion-renderer"),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert proc.stdout is not None
        last_progress = ""
        for line in proc.stdout:
            log.write(line)
            log.flush()
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")
            if mtype == "progress":
                prog = f"{msg.get('percent')} {msg.get('message')}"
                if prog != last_progress:
                    print(f"progress {prog}", flush=True)
                    last_progress = prog
            elif mtype == "error":
                print(f"ERROR {msg.get('message')}", flush=True)
            elif mtype == "done":
                print(f"DONE {msg.get('outputPath')}", flush=True)

        code = proc.wait()
    elapsed = time.time() - t0
    print(f"bridge exit={code} elapsed_sec={elapsed:.1f}", flush=True)

    if code != 0 or not OUT_MP4.is_file() or OUT_MP4.stat().st_size < 1000:
        print("render failed", file=sys.stderr)
        return 1

    # ffprobe
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(OUT_MP4),
        ],
        text=True,
    )
    dur = float(out.strip())
    expected = float(manifest["metadata"]["duration_sec"])
    print(
        json.dumps(
            {
                "output": str(OUT_MP4),
                "size_mb": round(OUT_MP4.stat().st_size / 1e6, 2),
                "duration_sec": round(dur, 3),
                "expected_sec": expected,
                "delta_sec": round(dur - expected, 3),
                "elapsed_sec": round(elapsed, 1),
                "transitions": len(manifest.get("transitions", [])),
                "overlays": len(manifest.get("overlays", [])),
                "captions": len(manifest.get("tracks", {}).get("captions", [])),
                "transition_types": sorted({t.get("type") for t in manifest.get("transitions", [])}),
                "overlay_types": sorted({o.get("type") for o in manifest.get("overlays", [])}),
            },
            indent=2,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
