FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Workspace manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/remotion-renderer/package.json packages/remotion-renderer/
COPY packages/shared-types/package.json packages/shared-types/
COPY render-service/package.json render-service/

RUN pnpm install --frozen-lockfile --filter @hanuman/render-service...

COPY packages/remotion-renderer packages/remotion-renderer
COPY packages/shared-types packages/shared-types
COPY render-service render-service

WORKDIR /app/render-service
EXPOSE 8081
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
