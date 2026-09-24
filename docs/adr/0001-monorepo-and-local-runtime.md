# ADR 0001 — Monorepo layout and local runtime

- Status: accepted
- Date: 2026-09-24

## Decision

- pnpm workspaces + Turborepo. Internal packages are consumed as TypeScript source
  (`exports` point to `src/*.ts`); Next.js transpiles them via `transpilePackages`, and
  Node processes (jobs, mocks, seed) run through `tsx`.
- Node 24 LTS is the runtime (Docker images and Railway). pnpm is pinned through
  `packageManager`.
- Local development runs entirely in Docker Compose with `apps/mock-providers`, a single
  mock server for Google OIDC, Mercado Libre and Mercado Pago (OAuth, Checkout Pro,
  signed webhooks). Real credentials are optional and swap in through `.env`.
- The root `.env` is loaded by `prisma.config.ts` and `next.config.ts` through
  `@quieroeso/config/load-dotenv`; existing variables always win, so containers and
  Railway are unaffected.
- `APP_ENV` (local/test/staging/production) is separate from `NODE_ENV`, because a local
  Docker build runs `NODE_ENV=production`. Mock providers are refused when `APP_ENV` is
  staging or production.

## Consequences

- No build step for internal packages; type errors surface in `pnpm typecheck`.
- End-to-end tests run offline and deterministically against the mock server.
