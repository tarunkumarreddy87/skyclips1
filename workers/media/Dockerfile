FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates fonts-liberation fonts-noto-core \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pnpm@9.15.0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN pip install --no-cache-dir uv
COPY packages/shared-types/python /src/packages/shared-types/python
COPY packages/timeline-schema/schema /src/packages/timeline-schema/schema
COPY workers/media/pyproject.toml workers/media/uv.lock* /src/workers/media/
WORKDIR /src/workers/media
RUN uv sync --no-dev
WORKDIR /src
COPY package.json pnpm-lock.yaml /src/
RUN printf '%s\n' 'packages:' '  - "packages/shared-types"' '  - "packages/video-engine"' '  - "render-service"' > pnpm-workspace.yaml
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json /src/packages/shared-types/
COPY packages/shared-types/src /src/packages/shared-types/src
COPY packages/video-engine /src/packages/video-engine
COPY render-service /src/render-service
COPY apps/web/public/sfx /src/render-service/static/sfx
RUN pnpm install --filter @hanuman/render-service... --frozen-lockfile=false
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN pnpm --filter @hanuman/render-service exec playwright install --with-deps chromium
COPY workers/media/src /src/workers/media/src
ENV PYTHONPATH=/src/workers/media
ENV RENDER_ENGINE=native
ENV RENDER_SERVICE_URL=http://render-service:8081
WORKDIR /src/workers/media
CMD ["uv", "run", "python", "-m", "src.worker"]
