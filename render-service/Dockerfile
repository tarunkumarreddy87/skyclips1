FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ffmpeg fonts-liberation fonts-noto-core ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@9.15.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/video-engine/package.json packages/video-engine/
COPY packages/shared-types/package.json packages/shared-types/
COPY render-service/package.json render-service/
RUN pnpm install --frozen-lockfile --filter @hanuman/render-service...
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN pnpm --filter @hanuman/render-service exec playwright install --with-deps chromium
COPY packages/video-engine packages/video-engine
COPY packages/shared-types packages/shared-types
COPY packages/timeline-schema/schema packages/timeline-schema/schema
COPY workers/media workers/media
COPY render-service render-service
COPY apps/web/public/sfx render-service/static/sfx
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir ./packages/shared-types/python ./workers/media
ENV RENDER_ENGINE=native-local
ENV RENDER_PYTHON_EXECUTABLE=/app/.venv/bin/python
WORKDIR /app/render-service
EXPOSE 8081
CMD ["node", "--import", "tsx", "src/index.ts"]
