FROM python:3.12-slim

# FFmpeg/ffprobe: Remotion still uses ffprobe for output duration; not for video encode.
# Chromium: Remotion local headless render (ADR 0009).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

# Node 22 + pnpm for packages/remotion-renderer bridge
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pnpm@9.15.0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

RUN pip install --no-cache-dir uv

# --- Python media worker ---
COPY packages/shared-types/python /src/packages/shared-types/python
COPY packages/timeline-schema/schema /src/packages/timeline-schema/schema
COPY workers/media/pyproject.toml workers/media/uv.lock* /src/workers/media/
WORKDIR /src/workers/media
RUN uv sync --no-dev || uv sync

# --- Remotion renderer (Node) ---
WORKDIR /src
COPY package.json /src/package.json
# Slim workspace — only packages needed for the Remotion bridge (skip apps/web).
RUN printf '%s\n' \
  'packages:' \
  '  - "packages/shared-types"' \
  '  - "packages/remotion-renderer"' \
  > /src/pnpm-workspace.yaml

COPY packages/shared-types/package.json /src/packages/shared-types/package.json
COPY packages/shared-types/tsconfig.json /src/packages/shared-types/tsconfig.json
COPY packages/shared-types/src /src/packages/shared-types/src

COPY packages/remotion-renderer/package.json /src/packages/remotion-renderer/package.json
COPY packages/remotion-renderer/tsconfig.json /src/packages/remotion-renderer/tsconfig.json
COPY packages/remotion-renderer/remotion.config.ts /src/packages/remotion-renderer/remotion.config.ts
COPY packages/remotion-renderer/src /src/packages/remotion-renderer/src
COPY packages/remotion-renderer/fixtures /src/packages/remotion-renderer/fixtures

COPY pnpm-lock.yaml* /src/
WORKDIR /src
RUN pnpm install --filter @hanuman/remotion-renderer... --frozen-lockfile=false

COPY workers/media/src /src/workers/media/src

ENV PYTHONPATH=/src/workers/media
ENV RENDER_ENGINE=remotion-lambda
ENV RENDER_FFMPEG_FALLBACK=false
ENV RENDER_SERVICE_URL=http://render-service:8081

WORKDIR /src/workers/media
CMD ["uv", "run", "python", "-m", "src.worker"]
