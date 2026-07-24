FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/remotion-renderer/package.json ./packages/remotion-renderer/
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS builder
COPY --from=deps /app ./
COPY . .
# next.config.ts rewrites() are evaluated at BUILD time. The /api/* rewrite must
# resolve to a host reachable from the running container — inside Docker that's the
# `api` service, not localhost (which is the web container itself).
# Default to the Docker internal host; overridable via build arg for other setups.
ARG API_INTERNAL_URL=http://api:8000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
# Client-side preview engine (Remotion Player) — must be present at build time.
ARG NEXT_PUBLIC_PREVIEW_ENGINE=remotion
ENV NEXT_PUBLIC_PREVIEW_ENGINE=${NEXT_PUBLIC_PREVIEW_ENGINE}
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN pnpm --filter @hanuman/web build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
