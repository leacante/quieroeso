# Operación en Railway

La infraestructura se define en [`.railway/railway.ts`](../../.railway/railway.ts) (IaC de Railway).
No se usan `railway.json` ni `railway.toml`.

## Servicios

| Servicio                | Imagen                                     | Arranque                      | Salud / horario                                                                    |
| ----------------------- | ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| `postgres`              | Plugin PostgreSQL de Railway               | —                             | Red privada; `DATABASE_URL` referenciada                                           |
| `web`                   | `apps/web/Dockerfile` (Next.js standalone) | `node apps/web/server.js`     | Pre-deploy `migrate`; healthcheck `/api/health` (300 s); reinicio `ON_FAILURE` (5) |
| `jobs-refresh-products` | `apps/jobs/Dockerfile`                     | `tsx src/refresh-products.ts` | Cron `17 */6 * * *`; reinicio `NEVER`                                              |

Región única `us-east4` para los tres recursos (verificar el identificador exacto con
`railway config plan`; Railway puede exponerlo con sufijo de zona).

### Diferencias con el plan original

- **Arranque de `web`**: el plan indicaba `pnpm --filter @quieroeso/web start`. Con salida
  `standalone` la imagen no incluye pnpm ni el workspace; se arranca `server.js`
  directamente (imagen más chica, arranque más rápido).
- **Migración previa**: el plan indicaba `pnpm --filter @quieroeso/db migrate:deploy`.
  La imagen web incluye un paquete `db` aislado (`pnpm deploy`) y el comando `migrate`
  ([`docker/web/migrate.sh`](../../docker/web/migrate.sh)) ejecuta `prisma migrate deploy`.
- **Jobs**: la imagen sólo contiene dependencias de producción; el cron también reintenta
  webhooks no procesados y purga ventanas de rate limit y estados OAuth vencidos.

## Primer despliegue

1. Instalar Railway CLI ≥ 5.49.1 y `railway login`.
2. `railway link` al proyecto y ambiente (`staging` primero).
3. Exportar el repositorio: `export QUIEROESO_GITHUB_REPO=owner/quieroeso-app`.
4. `railway config plan` y revisar el diff. **Aplicar sólo tras revisarlo**:
   `railway config apply`.
5. Cargar los secretos en Railway (quedan con `preserve()` en el IaC):

   | Variable                     | Valor                                                      |
   | ---------------------------- | ---------------------------------------------------------- |
   | `APP_URL`, `BETTER_AUTH_URL` | URL pública del ambiente (https)                           |
   | `BETTER_AUTH_SECRET`         | ≥ 32 caracteres aleatorios                                 |
   | `GOOGLE_CLIENT_ID/SECRET`    | Cliente OAuth web de Google del ambiente                   |
   | `MELI_CLIENT_ID/SECRET`      | Aplicación de Mercado Libre                                |
   | `MP_CLIENT_ID/SECRET`        | Aplicación de Mercado Pago (Marketplace)                   |
   | `MP_WEBHOOK_SECRET`          | Clave secreta de webhooks de la aplicación de Mercado Pago |
   | `TOKEN_ENCRYPTION_KEY_V1`    | `openssl rand -base64 32`                                  |
   | `IP_HASH_SECRET`             | ≥ 32 caracteres aleatorios                                 |

6. Configurar en cada proveedor (credenciales **separadas** por ambiente):
   - Google: URI de redirección `${APP_URL}/api/auth/callback/google`.
   - Mercado Pago: URL de redirección OAuth `${APP_URL}/api/integrations/mercadopago/callback`
     y webhook `${APP_URL}/api/webhooks/mercadopago` (evento _Pagos_).
   - Mercado Libre: aplicación separada de la de Mercado Pago (requisito desde 30/08/2026).
7. Desplegar y correr el smoke test: `node scripts/smoke-production.mjs ${APP_URL}`.

## Rotación de la clave de cifrado

1. Agregar `TOKEN_ENCRYPTION_KEY_V2` y cambiar `ACTIVE_TOKEN_KEY_VERSION=2` en `web` (y en el
   IaC). Los tokens existentes se siguen leyendo con V1; los nuevos se cifran con V2.
2. Los tokens de Mercado Pago se re-cifran al renovarse. Retirar V1 sólo cuando no quede
   ningún `MercadoPagoConnection.keyVersion = 1` ni enlaces no listados cifrados con V1.

## Operación

- **Backups**: habilitar backups diarios del volumen de PostgreSQL en Railway y probar una
  restauración antes del lanzamiento.
- **Alertas**: alertas de Railway por fallas de deploy, healthcheck y cron fallido (código ≠ 0).
- **Logs**: JSON (Pino) con redacción de secretos; nunca contienen tokens, cookies, enlaces
  secretos, mensajes de aportantes ni cuerpos de webhooks.
