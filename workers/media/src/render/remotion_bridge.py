"""Invoke packages/remotion-renderer bridge from the media worker (ADR 0009 Phase 3)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from src.config import settings
from src.pipeline.storage import get_bytes, presigned_download_url, put_bytes

logger = logging.getLogger(__name__)

ProgressCb = Callable[[int, str], None]

_REPO_ROOT = Path(__file__).resolve().parents[4]
_REMOTION_PKG = _REPO_ROOT / "packages" / "remotion-renderer"


def _resolve_pnpm() -> str:
    found = shutil.which("pnpm") or shutil.which("pnpm.cmd")
    if not found:
        raise RuntimeError("pnpm not found on PATH (required for Remotion bridge)")
    return found


def _hydrate_manifest_urls(manifest: dict[str, Any]) -> dict[str, Any]:
    """Replace S3 object keys in clip src fields with presigned HTTP URLs for Remotion."""
    hydrated = json.loads(json.dumps(manifest))
    tracks = hydrated.get("tracks", {})
    for track_name in ("video", "audio", "broll", "music"):
        for clip in tracks.get(track_name, []):
            src = clip.get("src")
            if not isinstance(src, str) or not src:
                continue
            if src.startswith(("http://", "https://", "color:", "static:")):
                continue
            clip["src"] = presigned_download_url(src)
    return hydrated


def _default_chrome() -> str | None:
    env = os.environ.get("REMOTION_BROWSER_EXECUTABLE") or settings.remotion_browser_executable
    if env and Path(env).is_file():
        return env
    for candidate in (
        Path("/usr/bin/chromium"),
        Path("/usr/bin/chromium-browser"),
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/google-chrome-stable"),
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def render_with_remotion(
    *,
    timeline_key: str,
    project_id: str,
    run_id: str,
    engine: str,
    on_progress: ProgressCb | None = None,
) -> tuple[str, float]:
    """Render timeline via Remotion and upload final.mp4.

    Returns (s3_key, probed_duration_sec).
    """
    if engine not in ("remotion-local", "remotion-lambda"):
        raise ValueError(f"Unsupported remotion engine: {engine}")

    if not _REMOTION_PKG.is_dir():
        raise RuntimeError(f"Remotion package missing at {_REMOTION_PKG}")

    manifest = _hydrate_manifest_urls(
        json.loads(get_bytes(timeline_key).decode("utf-8"))
    )
    output_key = f"projects/{project_id}/runs/{run_id}/final.mp4"

    with tempfile.TemporaryDirectory(prefix="hanuman-remotion-") as tmp:
        tmp_path = Path(tmp)
        out_file = tmp_path / "final.mp4"
        job_file = tmp_path / "job.json"
        job: dict[str, Any] = {
            "engine": engine,
            "manifest": manifest,
            "outputPath": str(out_file),
        }
        chrome = _default_chrome()
        if chrome:
            job["browserExecutable"] = chrome
        job_file.write_text(json.dumps(job), encoding="utf-8")

        pnpm = _resolve_pnpm()
        cmd = [
            pnpm,
            "exec",
            "tsx",
            "src/bridge/job.ts",
            f"--job={job_file}",
        ]
        env = os.environ.copy()
        # Ensure Remotion AWS vars from settings reach the Node process.
        if settings.remotion_aws_access_key_id:
            env["REMOTION_AWS_ACCESS_KEY_ID"] = settings.remotion_aws_access_key_id
        if settings.remotion_aws_secret_access_key:
            env["REMOTION_AWS_SECRET_ACCESS_KEY"] = settings.remotion_aws_secret_access_key
        if settings.remotion_aws_region:
            env["REMOTION_AWS_REGION"] = settings.remotion_aws_region
        if settings.remotion_serve_url:
            env["REMOTION_SERVE_URL"] = settings.remotion_serve_url
        if settings.remotion_function_name:
            env["REMOTION_FUNCTION_NAME"] = settings.remotion_function_name
        if settings.remotion_frames_per_lambda:
            env["REMOTION_FRAMES_PER_LAMBDA"] = str(settings.remotion_frames_per_lambda)

        logger.info("Remotion bridge: engine=%s cwd=%s", engine, _REMOTION_PKG)
        # #region agent log
        try:
            import time as _time
            _log = Path(__file__).resolve().parents[4] / "debug-424443.log"
            _log.open("a", encoding="utf-8").write(
                json.dumps(
                    {
                        "sessionId": "424443",
                        "runId": "remotion-bridge",
                        "hypothesisId": "B",
                        "location": "remotion_bridge.py:spawn",
                        "message": "spawning remotion subprocess",
                        "data": {
                            "engine": engine,
                            "video_n": len((manifest.get("tracks") or {}).get("video") or []),
                            "duration_sec": (manifest.get("metadata") or {}).get("duration_sec"),
                            "timeout_sec": settings.remotion_bridge_timeout_sec,
                            "has_chrome": bool(chrome),
                        },
                        "timestamp": int(_time.time() * 1000),
                    }
                )
                + "\n"
            )
        except Exception:
            pass
        # #endregion
        proc = subprocess.Popen(
            cmd,
            cwd=str(_REMOTION_PKG),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        assert proc.stdout is not None
        last_error: str | None = None
        last_progress_pct: int | None = None
        progress_events = 0
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                logger.debug("remotion bridge non-json: %s", line[:200])
                continue

            mtype = msg.get("type")
            if mtype == "progress" and on_progress:
                progress_events += 1
                last_progress_pct = int(msg.get("percent") or 0)
                on_progress(int(msg.get("percent") or 90), str(msg.get("message") or "Rendering"))
                # #region agent log
                if progress_events == 1 or progress_events % 10 == 0 or last_progress_pct >= 95:
                    try:
                        import time as _time
                        _log = Path(__file__).resolve().parents[4] / "debug-424443.log"
                        _log.open("a", encoding="utf-8").write(
                            json.dumps(
                                {
                                    "sessionId": "424443",
                                    "runId": "remotion-bridge",
                                    "hypothesisId": "B",
                                    "location": "remotion_bridge.py:progress",
                                    "message": "remotion progress",
                                    "data": {
                                        "percent": last_progress_pct,
                                        "events": progress_events,
                                        "msg": str(msg.get("message") or "")[:120],
                                    },
                                    "timestamp": int(_time.time() * 1000),
                                }
                            )
                            + "\n"
                        )
                    except Exception:
                        pass
                # #endregion
            elif mtype == "error":
                last_error = str(msg.get("message") or "Remotion render failed")
            elif mtype == "done":
                logger.info(
                    "Remotion done engine=%s cost=%s",
                    msg.get("engine"),
                    msg.get("costUsd"),
                )

        stderr = proc.stderr.read() if proc.stderr else ""
        code = proc.wait(timeout=settings.remotion_bridge_timeout_sec)
        # #region agent log
        try:
            import time as _time
            _log = Path(__file__).resolve().parents[4] / "debug-424443.log"
            _log.open("a", encoding="utf-8").write(
                json.dumps(
                    {
                        "sessionId": "424443",
                        "runId": "remotion-bridge",
                        "hypothesisId": "C",
                        "location": "remotion_bridge.py:exit",
                        "message": "remotion subprocess exited",
                        "data": {
                            "exit_code": code,
                            "last_error": (last_error or "")[:400],
                            "stderr_tail": (stderr or "")[-400:],
                            "progress_events": progress_events,
                            "last_progress_pct": last_progress_pct,
                            "out_exists": out_file.is_file(),
                            "out_size": out_file.stat().st_size if out_file.is_file() else 0,
                        },
                        "timestamp": int(_time.time() * 1000),
                    }
                )
                + "\n"
            )
        except Exception:
            pass
        # #endregion
        if code != 0:
            detail = last_error or stderr[-1500:] or f"exit {code}"
            raise RuntimeError(f"Remotion bridge failed: {detail}")

        if not out_file.is_file() or out_file.stat().st_size < 1000:
            raise RuntimeError("Remotion bridge produced no output file")

        duration_sec = _probe_media_duration(out_file)
        put_bytes(output_key, out_file.read_bytes(), "video/mp4")
        return output_key, duration_sec


def _probe_media_duration(path: Path) -> float:
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
        check=False,
    )
    try:
        return float((result.stdout or "").strip() or "0")
    except ValueError:
        return 0.0
