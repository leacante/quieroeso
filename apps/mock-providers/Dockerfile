# syntax=docker/dockerfile:1.7
# Local-only mock of Google OIDC, Mercado Libre and Mercado Pago. Never deployed.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS builder
COPY . .
RUN pnpm --filter @quieroeso/mock-providers deploy --prod --legacy /out/mocks

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production PORT=4010
WORKDIR /app
COPY --from=builder --chown=node:node /out/mocks ./
USER node
EXPOSE 4010
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:4010/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
