# syntax=docker/dockerfile:1.7
# QuieroEso scheduled jobs. Build from the repository root:
#   docker build -f apps/jobs/Dockerfile .
# Default command refreshes product snapshots (Railway cron `17 */6 * * *`).

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @quieroeso/jobs --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY .pnpmfile.cjs .npmrc tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @quieroeso/db generate
RUN pnpm --filter @quieroeso/jobs deploy --prod --legacy /out/jobs

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /out/jobs ./
USER node
CMD ["./node_modules/.bin/tsx", "src/refresh-products.ts"]
