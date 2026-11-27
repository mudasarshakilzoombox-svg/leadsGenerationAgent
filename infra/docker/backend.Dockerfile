# syntax=docker/dockerfile:1.7
# Image for the NestJS processes. Build one per app:
#   docker build -f infra/docker/backend.Dockerfile --build-arg APP=api    --target runtime .
#   docker build -f infra/docker/backend.Dockerfile --build-arg APP=worker --target runtime .
#   docker build -f infra/docker/backend.Dockerfile --build-arg APP=api    --target migrate .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true \
    npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=120000 npm_config_network_concurrency=8
RUN npm install -g pnpm@10.34.9 --no-fund --no-audit
WORKDIR /repo

# Prune the monorepo to the target app and its workspace dependencies.
FROM base AS pruner
ARG APP
COPY . .
RUN pnpm dlx turbo@2.11.13 prune @lga/${APP} --docker

FROM base AS builder
ARG APP
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/.npmrc /repo/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@lga/${APP}
# Self-contained production bundle: app + workspace packages + prod dependencies only.
RUN pnpm --filter=@lga/${APP} deploy --prod --legacy /out

# One-off migration runner (schema owner credentials, never started by default).
FROM builder AS migrate
WORKDIR /repo/packages/core
# Apply migrations, then sync the code-managed plan and role catalogs (ADR-0033).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/seed/run-seed.js --catalogs-only"]

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /out ./
USER node
CMD ["node", "--enable-source-maps", "dist/main.js"]
