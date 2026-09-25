# syntax=docker/dockerfile:1.7
# QuieroEso web: Next.js standalone server plus a self-contained Prisma migrator.
# Build from the repository root: docker build -f apps/web/Dockerfile .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Only the workspaces the web app depends on.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @quieroeso/web --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY .pnpmfile.cjs .npmrc tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @quieroeso/db generate
ENV NODE_ENV=production
RUN pnpm --filter @quieroeso/web build
# Isolated production install of the db package, used by the pre-deploy migration.
RUN pnpm --filter @quieroeso/db deploy --prod --legacy /out/migrate

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# Prisma's schema engine (pre-deploy migrations) needs OpenSSL to pick its binary.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /out/migrate ./migrate
COPY --chown=node:node --chmod=755 docker/web/migrate.sh /usr/local/bin/migrate
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
