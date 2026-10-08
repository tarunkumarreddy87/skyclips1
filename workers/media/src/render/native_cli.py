"""JSON-lines progress and result protocol for the cloud render service."""
from __future__ import annotations

import argparse
import json
import tempfile
import signal
import threading
from pathlib import Path
from src.config import settings

from src.pipeline.storage import put_file
from src.render.ffmpeg_pipeline import render_manifest, validate_manifest
from src.render.native_pipeline import probe, select_encoder, RenderCancelled


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("request", type=Path)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding="utf-8"))
    manifest = request["manifest"]
    validate_manifest(manifest)
    cancelled = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: cancelled.set())
    signal.signal(signal.SIGINT, lambda *_: cancelled.set())
    def progress(percent: int, message: str) -> None:
        print(json.dumps({"type": "progress", "progress": percent, "message": message}), flush=True)
    with tempfile.TemporaryDirectory(prefix="hanuman-render-") as directory:
        output = render_manifest(manifest, Path(directory), on_progress=progress, cancel_event=cancelled)
        duration = float(probe(output)["format"]["duration"])
        if cancelled.is_set():
            raise RenderCancelled("Render cancelled before upload")
        progress(99, "Uploading final video")
        put_file(request["outputKey"], output, "video/mp4")
        if cancelled.is_set():
            raise RenderCancelled("Render cancelled during upload")
        print(json.dumps({"type": "result", "outputKey": request["outputKey"],
                          "durationSec": duration, "encoder": select_encoder(settings.render_encoder),
                          "engine": "hanuman-native-v1"}), flush=True)


if __name__ == "__main__":
    main()
