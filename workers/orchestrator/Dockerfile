FROM python:3.12-slim

# ffprobe is needed to measure TTS audio duration (Sarvam WAVs use headers the
# Python wave module can't always parse). ffmpeg package provides both ffmpeg + ffprobe.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

RUN pip install --no-cache-dir uv

COPY packages/shared-types/python /src/packages/shared-types/python
COPY workers/orchestrator/pyproject.toml workers/orchestrator/uv.lock* /src/workers/orchestrator/
WORKDIR /src/workers/orchestrator
RUN uv sync --no-dev || uv sync

WORKDIR /src/workers/orchestrator
COPY workers/orchestrator/src ./src

ENV PYTHONPATH=/src/workers/orchestrator
CMD ["uv", "run", "python", "-m", "src.worker"]
