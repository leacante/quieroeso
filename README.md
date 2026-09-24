# QuieroEso

Listas de deseos para compartir: productos de Mercado Libre, visibilidad privada, con
enlace o pública, y aportes opcionales por producto que Mercado Pago acredita directo en la
cuenta de quien armó la lista. QuieroEso no custodia fondos.

## Probarlo en local (Docker, sin credenciales)

```bash
docker compose up --build
```

- App: http://localhost:3000 — "Continuar con Google" abre un simulador con cuentas de prueba.
- Simulador de proveedores: http://localhost:4010 (pagos simulados en `/mp/_admin`).
- Datos de ejemplo: `docker compose --profile jobs run --rm jobs ./node_modules/.bin/tsx node_modules/@quieroeso/domain/src/seed.ts`
- Actualizar productos: `docker compose --profile jobs run --rm jobs`

Todo el flujo (login, importar desde Mercado Libre, publicar, conectar Mercado Pago, aportar,
webhooks, reembolsos) funciona offline contra `apps/mock-providers`.

## Desarrollo

Requisitos: Node 24 (`.nvmrc`), pnpm 10.33 (vía Corepack), Docker.

```bash
pnpm install
pnpm env:setup                 # .env con secretos locales y proveedores simulados
docker compose up -d postgres
pnpm db:migrate && pnpm db:seed
pnpm --filter @quieroeso/mock-providers dev   # en otra terminal
pnpm --filter @quieroeso/web dev              # http://localhost:3000
```

Calidad:

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration          # PostgreSQL real (base quieroeso_test)
pnpm test:e2e                  # con el stack levantado (Docker o dev)
pnpm build
```

## Documentación

- Plan y especificación: [`2026-09-23-quieroeso-mvp.md`](2026-09-23-quieroeso-mvp.md)
- Guía para agentes y convenciones: [`AGENTS.md`](AGENTS.md)
- Decisiones: [`docs/adr/`](docs/adr/)
- Operación: [Railway](docs/operations/railway.md), [lanzamiento](docs/operations/release-checklist.md), [incidentes](docs/operations/incidents.md)
- Sistema de diseño: [`design-system/quieroeso/MASTER.md`](design-system/quieroeso/MASTER.md)
