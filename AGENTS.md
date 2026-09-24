# AGENTS.md

Guidance for coding agents (and humans) working on QuieroEso. Read this before changing code.

## What this is

QuieroEso lets people build wishlists (private, unlisted or public), import products from
Mercado Libre and optionally receive per-item contributions paid through Mercado Pago
Checkout Pro directly into the owner's account. The product spec and task plan live in
`2026-09-23-quieroeso-mvp.md`; deviations are recorded in `docs/adr/`.

## Layout

| Path                                | Purpose                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| `apps/web`                          | Next.js 16.3 App Router app (UI + route handlers)                     |
| `apps/jobs`                         | Scheduled processes (`refresh-products`, `cleanup`)                   |
| `apps/mock-providers`               | Local mock of Google OIDC, Mercado Libre and Mercado Pago             |
| `packages/config`                   | Validated environment (`getEnv()`), root `.env` loader                |
| `packages/db`                       | Prisma 7 schema, migrations, seed, client (`getPrisma()`)             |
| `packages/domain`                   | Business rules (lists, fees, contributions, security). Framework-free |
| `packages/integrations`             | Mercado Libre, Mercado Pago and token vault clients                   |
| `packages/observability`            | Pino logger with secret redaction                                     |
| `packages/ui`                       | Design tokens (`tokens.css`) and UI primitives                        |
| `design-system/quieroeso/MASTER.md` | Visual source of truth (UI UX Pro Max)                                |
| `tests/e2e`                         | Playwright end-to-end tests                                           |

## Deterministic commands

```bash
pnpm install
pnpm env:setup               # creates .env with local secrets (mock providers on)
docker compose up -d postgres
pnpm db:migrate              # prisma migrate dev
pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration        # needs TEST_DATABASE_URL (docker compose postgres)
pnpm test:e2e                # needs the full stack: docker compose up --build
docker compose up --build    # full local stack on http://localhost:3000
```

Every command must exit 0 before a change is considered done.

## Rules

- TypeScript `strict`; no explicit `any` (lint error). Money is `bigint` minor units — never floats.
  Use `packages/domain/src/money` helpers.
- Business rules go in `packages/domain`, taking a Prisma client/transaction as an argument.
  Route handlers only parse input, authorize, call the domain and map errors to
  `application/problem+json` (`apps/web/lib/server/problem.ts`).
- Never log tokens, cookies, share tokens, contributor messages or full webhook bodies.
  Use `@quieroeso/observability` (it redacts) and `fingerprint()` for correlation.
- Only `PUBLIC` lists may appear in sitemap, public API, `llms.txt` or metadata.
  Unlisted pages send `noindex,nofollow` and `Referrer-Policy: no-referrer`.
- Webhooks are the only source of truth for payment state. Return pages never mutate it.
- UI: follow `design-system/quieroeso/MASTER.md`; semantic tokens only (no raw hex in
  components), visible labels, 44px touch targets, `prefers-reduced-motion`, voseo
  rioplatense copy ("Armá", "Compartí").
- Railway config lives only in `.railway/railway.ts` (no `railway.json`/`railway.toml`).
- Tooling quirks: see `docs/adr/0002-typescript-7.md` (TS 7 + ESLint shim).

## Next.js

`next dev` maintains a version-matched docs block in `apps/web/AGENTS.md`. Prefer it over
memory: Next.js 16 renamed `middleware` to `proxy`, made `params`/`searchParams` async and
uses Turbopack by default.
