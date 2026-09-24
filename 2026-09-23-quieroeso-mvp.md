# QuieroEso MVP — Plan de desarrollo

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas `- [ ]` para seguimiento.

**Objetivo:** Construir una aplicación web para crear listas públicas, no listadas o privadas, importar productos de Mercado Libre y permitir opcionalmente aportes acreditados directamente en la cuenta de Mercado Pago del propietario.

**Arquitectura:** Monorepo TypeScript con Next.js como aplicación full-stack, PostgreSQL como sistema de registro y un proceso TypeScript separado para tareas programadas. La lógica de negocio y las integraciones se implementan en paquetes independientes del framework para que puedan probarse y reutilizarse.

**Stack:** Node.js 24 LTS, TypeScript 7, Next.js 16.3, React 19, pnpm workspaces, Turborepo, Better Auth 1.7, Prisma 7, PostgreSQL, Zod, Pino, Vitest y Playwright. Despliegue en Railway.

**Especificación:** Las secciones “Definición funcional” a “Operación en Railway” de este mismo documento.

## Restricciones globales

- Todo el código de producto debe escribirse en TypeScript con `strict: true`.
- La aplicación no custodia dinero: cada pago se crea con el token OAuth de Mercado Pago del propietario de la lista.
- Una preferencia de Checkout Pro representa un único producto y un único aporte.
- Los importes se almacenan como enteros en unidad mínima (`bigint` en centavos); no se usa aritmética de punto flotante para dinero.
- La primera lista publicada por un usuario recibe hasta ocho cupos de productos con comisión de plataforma del 0%; el resto usa 100 puntos básicos (1%).
- Las listas posteriores aplican 1% desde el primer producto con aportes.
- La comisión propia de Mercado Pago es independiente de la comisión de la plataforma.
- Los tokens OAuth se cifran con AES-256-GCM antes de guardarse.
- Sólo las listas `PUBLIC` se indexan. Las listas `UNLISTED` y `PRIVATE` no aparecen en sitemap ni en endpoints públicos enumerables.
- Los webhooks verificados son la fuente de verdad para confirmar pagos; las páginas de retorno no cambian estados financieros.
- La integración con Mercado Libre utiliza APIs oficiales y caché local; no depende de scraping general de páginas.
- Railway debe configurarse mediante `.railway/railway.ts`; no se crean nuevos `railway.json` o `railway.toml`.

## Foco de revisión

1. Dos publicaciones concurrentes del mismo usuario deben elegir una sola primera lista promocional; la tarea 4 incluye una prueba transaccional.
2. Reintentos y duplicados de Mercado Pago no deben acreditar dos veces; la tarea 11 incluye pruebas por `paymentId`, `eventId` e idempotency key.
3. Un enlace de importación no puede utilizarse para SSRF; la tarea 6 verifica hosts, redirecciones, protocolos e IPs privadas.
4. Eliminar y recrear productos no debe regenerar cupos consumidos; la tarea 5 prueba liberación sólo cuando nunca hubo un aporte aprobado.
5. Una lista no listada no debe filtrarse por sitemap, API pública, metadatos o logs; las tareas 7 y 8 cubren estos accesos.

---

## Definición funcional

### Nombre y dominio provisionales

El nombre de trabajo es **QuieroEso** y el dominio preferido durante el desarrollo es `quieroeso.app`. Ninguno se considera definitivo: la marca y el dominio se elegirán antes de publicar producción. Para evitar acoplar el producto al dominio, todas las URLs públicas deben obtenerse de `APP_URL` y no escribirse directamente en el código.

Estos dominios aparecían disponibles —sin registro en la consulta RDAP— el **22 de septiembre de 2026**. La disponibilidad puede cambiar y debe comprobarse nuevamente antes de registrar el dominio elegido.

| Prioridad actual | Dominio disponible | Observación |
|---:|---|---|
| 1 | `quieroeso.app` | Preferido para el desarrollo |
| 2 | `listaya.app` | Primera alternativa |
| 3 | `juntalo.app` | Alternativa |
| 4 | `armalista.app` | Alternativa |
| 5 | `milistita.app` | Alternativa |
| 6 | `compartilo.app` | Alternativa |
| 7 | `elegilo.app` | Alternativa |
| 8 | `wishalo.app` | Alternativa |
| 9 | `guardalo.app` | Alternativa |
| 10 | `desealo.app` | Alternativa y nombre anterior del proyecto |
| 11 | `unjuntito.com` | Alternativa con extensión `.com` |

Antes del lanzamiento se debe verificar disponibilidad, registrar el dominio seleccionado y recién entonces cerrar la marca, los metadatos, los identificadores OAuth y las URLs de retorno.

### Usuarios y acceso

- El único acceso del MVP es “Continuar con Google”.
- Better Auth administra usuarios, cuentas OAuth, sesiones y cookies seguras.
- El identificador de identidad es el `sub` de Google; el correo no funciona como clave estable.
- Los visitantes pueden ver listas compartidas y aportar sin crear una cuenta de QuieroEso.
- Sólo el propietario puede editar, publicar, archivar o conectar Mercado Pago.

### Visibilidad de listas

| Estado | URL | Acceso | Indexación |
|---|---|---|---|
| `PRIVATE` | Sin URL externa | Propietario autenticado | No |
| `UNLISTED` | `/s/{token}` | Cualquier persona con el enlace secreto | No; `noindex,nofollow` |
| `PUBLIC` | `/l/{slug}` | Pública | Sí; sitemap y API pública |

El token no listado se genera con 32 bytes aleatorios. La base guarda únicamente `SHA-256(token)` para que una filtración no revele URLs compartibles.

### Modalidades

- `WISHLIST`: muestra productos y enlaces externos. No exige Mercado Pago y no crea aportes.
- `PER_ITEM`: cada producto puede recibir aportes hasta un objetivo monetario.

Una lista puede pasar de `WISHLIST` a `PER_ITEM` después de conectar Mercado Pago. Volver a `WISHLIST` oculta nuevas acciones de aporte, pero conserva el historial.

### Política de comisión

1. `FreeTierEntitlement.firstPublishedListId` comienza vacío.
2. La primera transición exitosa de una lista a `PUBLIC` o `UNLISTED` fija ese identificador de manera irreversible.
3. En esa lista, los primeros ocho productos activos reciben un `FreeProductSlot` y `feeRateBps = 0`.
4. Si la lista se publica con menos de ocho productos, los siguientes productos agregados consumen los cupos restantes.
5. Reordenar productos no cambia el cupo asignado.
6. Si un producto gratuito se elimina antes de cualquier aporte aprobado, el cupo se libera.
7. Cuando el producto recibe su primer aporte aprobado, el cupo queda consumido aunque el producto se archive o elimine.
8. Los productos sin cupo y todos los productos de listas posteriores usan `feeRateBps = 100`.
9. Cada `Contribution` copia la tasa y el importe de comisión para conservar el historial.
10. La comisión se calcula con redondeo half-up a centavos:

```ts
export function calculateFeeMinor(amountMinor: bigint, rateBps: bigint): bigint {
  return (amountMinor * rateBps + 5_000n) / 10_000n;
}
```

### Mercado Libre

- Se aceptan enlaces de `mercadolibre.com.ar`, sus subdominios de artículos y enlaces cortos `meli.la`.
- La aplicación resuelve el identificador de publicación o catálogo, consulta la API oficial y guarda un snapshot.
- El usuario puede corregir título, imagen, objetivo y notas sin perder los datos de origen.
- El proceso programado actualiza snapshots con más de 12 horas, en lotes de 50 y concurrencia máxima de 5.
- Ante `429`, aplica backoff exponencial con jitter y conserva el último snapshot válido.
- Un producto eliminado o pausado permanece visible con estado `UNAVAILABLE`; no desaparece automáticamente.

### Mercado Pago

- El propietario conecta su cuenta mediante OAuth Authorization Code con PKCE y `state` de un solo uso.
- Access token y refresh token se cifran; se almacena su vencimiento y el identificador de usuario de Mercado Pago.
- Checkout Pro se crea con el access token del propietario.
- `marketplace_fee` se omite para tasa 0% y contiene el importe calculado para tasa 1%.
- La preferencia incluye `external_reference = contribution.id`, URLs de retorno y `notification_url`.
- Cada creación usa `X-Idempotency-Key = contribution.id`.
- El webhook valida `x-signature` y `x-request-id`, responde rápidamente y luego consulta el recurso a Mercado Pago antes de actualizar el estado.
- Estados internos: `CREATED`, `CHECKOUT_CREATED`, `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `REFUNDED`, `CHARGED_BACK`.
- Reembolsos se gestionan desde Mercado Pago en el MVP; la aplicación sincroniza el estado recibido.

### AI friendly y compartibilidad

- Las páginas públicas se renderizan en servidor y contienen HTML semántico.
- Cada lista pública expone Open Graph, imagen dinámica y JSON-LD `ItemList` con `ListItem` y `Product`.
- `/api/public/lists/{slug}` ofrece una representación JSON de sólo lectura.
- `/openapi.json` describe endpoints públicos y callbacks internos sin exponer secretos.
- `/llms.txt` explica el producto y enlaza únicamente contenido público.
- Next.js 16.3 mantiene documentación versionada para agentes mediante su bloque generado en `AGENTS.md`.
- El repositorio añade `AGENTS.md`, ADRs cortos, datos seed y comandos deterministas para que un agente pueda ejecutar y verificar cambios sin conocimiento implícito.

## Arquitectura del monorepo

```text
.
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── (dashboard)/dashboard/
│   │   │   ├── api/
│   │   │   ├── l/[slug]/
│   │   │   └── s/[token]/
│   │   ├── components/
│   │   ├── lib/
│   │   └── public/
│   └── jobs/
│       └── src/refresh-products.ts
├── packages/
│   ├── config/
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/seed.ts
│   │   └── src/client.ts
│   ├── domain/
│   │   └── src/{lists,fees,contributions,money}/
│   ├── integrations/
│   │   └── src/{mercadolibre,mercadopago,crypto}/
│   ├── observability/
│   └── ui/
├── tests/e2e/
├── .railway/railway.ts
├── AGENTS.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

`apps/web` y `apps/jobs` son desplegables. Los paquetes no conocen rutas de Next.js y exponen funciones explícitas.

## Modelo de datos

### Modelos de negocio

```prisma
enum ListVisibility {
  PRIVATE
  UNLISTED
  PUBLIC
}

enum FundingMode {
  WISHLIST
  PER_ITEM
}

enum ContributionStatus {
  CREATED
  CHECKOUT_CREATED
  PENDING
  APPROVED
  REJECTED
  CANCELLED
  REFUNDED
  CHARGED_BACK
}

model WishList {
  id                 String         @id @default(cuid())
  ownerId            String
  title              String
  description        String?
  slug               String         @unique
  visibility         ListVisibility @default(PRIVATE)
  fundingMode        FundingMode    @default(WISHLIST)
  shareTokenHash     String?        @unique
  publishedAt        DateTime?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  items              ListItem[]
  promotionEntitlement FreeTierEntitlement? @relation("FirstPublishedList")
}

model ListItem {
  id                 String   @id @default(cuid())
  listId             String
  position           Int
  sourceType         String
  sourceUrl          String
  externalId         String?
  title              String
  notes              String?
  imageUrl           String?
  priceMinor         BigInt?
  targetAmountMinor  BigInt?
  currency           String   @default("ARS")
  availability       String
  lastSyncedAt       DateTime?
  feeRateBps         Int      @default(100)
  archivedAt         DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  list               WishList @relation(fields: [listId], references: [id])
  freeSlot            FreeProductSlot?
  contributions      Contribution[]

  @@unique([listId, position])
  @@index([listId, archivedAt])
  @@index([externalId])
}

model FreeTierEntitlement {
  id                     String   @id @default(cuid())
  userId                 String   @unique
  firstPublishedListId   String   @unique
  assignedAt             DateTime @default(now())
  slots                  FreeProductSlot[]
  firstPublishedList     WishList @relation("FirstPublishedList", fields: [firstPublishedListId], references: [id])
}

model FreeProductSlot {
  id             String   @id @default(cuid())
  entitlementId  String
  slotNumber     Int
  listItemId     String?  @unique
  consumedAt     DateTime?
  releasedAt     DateTime?
  entitlement    FreeTierEntitlement @relation(fields: [entitlementId], references: [id])
  listItem       ListItem? @relation(fields: [listItemId], references: [id])

  @@unique([entitlementId, slotNumber])
}

model MercadoPagoConnection {
  id                    String   @id @default(cuid())
  userId                String   @unique
  mercadoPagoUserId     String   @unique
  encryptedAccessToken  String
  encryptedRefreshToken String
  tokenExpiresAt        DateTime
  keyVersion            Int
  status                String
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model Contribution {
  id                    String             @id @default(cuid())
  listItemId            String
  amountMinor           BigInt
  currency              String             @default("ARS")
  contributorName       String?
  contributorMessage    String?
  status                ContributionStatus @default(CREATED)
  platformFeeRateBps    Int
  platformFeeAmountMinor BigInt
  mpPreferenceId        String?            @unique
  mpPaymentId           String?            @unique
  idempotencyKey        String             @unique
  approvedAt            DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt
  listItem              ListItem           @relation(fields: [listItemId], references: [id])
}

model WebhookEvent {
  id              String   @id @default(cuid())
  provider        String
  providerEventId String
  payloadHash     String
  processedAt     DateTime?
  createdAt       DateTime @default(now())

  @@unique([provider, providerEventId])
}
```

Los modelos generados por Better Auth se agregan al mismo esquema Prisma. Las relaciones hacia `user.id` usan `onDelete: Restrict` cuando existen registros financieros y `Cascade` sólo para sesiones revocables.

## Contratos HTTP

| Método | Ruta | Acceso | Resultado |
|---|---|---|---|
| `GET/POST` | `/api/auth/[...all]` | Público | Better Auth |
| `GET/POST` | `/api/lists` | Propietario | Listar o crear listas |
| `GET/PATCH/DELETE` | `/api/lists/{id}` | Propietario | Administrar lista |
| `POST` | `/api/lists/{id}/publish` | Propietario | Publicar y asignar beneficio inicial |
| `POST` | `/api/lists/{id}/items/import` | Propietario | Importar enlace de Mercado Libre |
| `POST` | `/api/lists/{id}/items` | Propietario | Crear producto manual |
| `PATCH/DELETE` | `/api/lists/{id}/items/{itemId}` | Propietario | Editar o archivar producto |
| `POST` | `/api/integrations/mercadopago/connect` | Propietario | Iniciar OAuth con PKCE |
| `GET` | `/api/integrations/mercadopago/callback` | Callback OAuth | Guardar conexión cifrada |
| `POST` | `/api/contributions` | Público limitado | Crear aporte y Checkout Pro |
| `POST` | `/api/webhooks/mercadopago` | Mercado Pago | Sincronizar pago |
| `GET` | `/api/public/lists/{slug}` | Público | JSON de lista pública |
| `GET` | `/api/health` | Público | Salud del proceso y base |

Los errores usan `application/problem+json`:

```ts
export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
};
```

## Seguridad y privacidad

- Cookies de sesión `HttpOnly`, `Secure` y `SameSite=Lax` en producción.
- Validación de origen para mutaciones autenticadas y protección CSRF de Better Auth.
- OAuth de Mercado Pago con `state` aleatorio, PKCE y vencimiento de 10 minutos.
- AES-256-GCM con envelope `{version, iv, tag, ciphertext}` y clave base64 de 32 bytes.
- Rotación soportada mediante `keyVersion`; sólo la versión activa cifra nuevos tokens.
- Webhook con validación de firma antes de consultar o persistir datos financieros.
- Allowlist de hosts de Mercado Libre, sólo HTTPS, máximo tres redirecciones y rechazo de destinos privados, loopback o link-local.
- Límite de cuerpo de 32 KB para callbacks y 16 KB para creación de aportes.
- Rate limit persistido en PostgreSQL: 20 importaciones por usuario cada 10 minutos y 10 checkouts por combinación IP/lista cada 10 minutos.
- IPs registradas únicamente como HMAC diario para limitar abuso sin almacenar la IP cruda.
- Logs sin tokens, cookies, URLs secretas, mensajes de contribuyentes ni cuerpos completos de webhook.
- Borrado lógico de listas con aportes; los datos financieros se conservan según la política legal publicada.

## Operación en Railway

Servicios:

1. `web`: `pnpm --filter @quieroeso/web start`, healthcheck `/api/health`.
2. `postgres`: plugin PostgreSQL de Railway.
3. `jobs-refresh-products`: `pnpm --filter @quieroeso/jobs refresh-products`, cron `17 */6 * * *`.

Variables de producción:

```text
NODE_ENV=production
APP_URL=https://quieroeso.app
DATABASE_URL=<referencia privada de Railway>
BETTER_AUTH_SECRET=<32 bytes o más>
BETTER_AUTH_URL=https://quieroeso.app
GOOGLE_CLIENT_ID=<Google OAuth web client>
GOOGLE_CLIENT_SECRET=<Google OAuth secret>
MELI_CLIENT_ID=<Mercado Libre app id>
MELI_CLIENT_SECRET=<Mercado Libre secret>
MP_CLIENT_ID=<Mercado Pago app id>
MP_CLIENT_SECRET=<Mercado Pago secret>
TOKEN_ENCRYPTION_KEY_V1=<32 bytes base64>
ACTIVE_TOKEN_KEY_VERSION=1
MIN_CONTRIBUTION_MINOR=100000
LOG_LEVEL=info
```

Las credenciales reales se cargan únicamente como secretos de Railway. El repositorio incluye `.env.example` con nombres y ejemplos no sensibles.

## Plan de implementación

### Tarea 1: Inicializar el monorepo y los controles de calidad

**Archivos:**
- Crear: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- Crear: `apps/web/package.json`, `apps/jobs/package.json`
- Crear: `packages/{config,db,domain,integrations,observability,ui}/package.json`
- Crear: `.env.example`, `AGENTS.md`

**Interfaces:**
- Produce los workspaces `@quieroeso/web`, `@quieroeso/jobs`, `@quieroeso/db`, `@quieroeso/domain` y `@quieroeso/integrations`.

- [ ] Crear el workspace con Node 24, pnpm y Turborepo; fijar `packageManager` y `engines`.
- [ ] Crear Next.js 16.3 en `apps/web` con App Router, TypeScript estricto y salida `standalone`.
- [ ] Configurar scripts raíz `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e` y `db:migrate`.
- [ ] Añadir ESLint, Prettier y reglas que prohíban `any` explícito en código de dominio.
- [ ] Escribir una prueba Vitest mínima para confirmar resolución de paquetes.
- [ ] Ejecutar `pnpm install && pnpm lint && pnpm typecheck && pnpm test` y exigir código 0.
- [ ] Commit: `chore: initialize TypeScript monorepo`.

### Tarea 2: Configuración validada y observabilidad

**Archivos:**
- Crear: `packages/config/src/env.ts`
- Crear: `packages/observability/src/logger.ts`
- Crear: `apps/web/app/api/health/route.ts`
- Prueba: `packages/config/src/env.test.ts`

**Interfaces:**
- Produce `env: AppEnvironment` y `logger` con redacción de secretos.

```ts
export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY_V1: z.string().base64(),
  ACTIVE_TOKEN_KEY_VERSION: z.coerce.number().int().positive(),
  MIN_CONTRIBUTION_MINOR: z.coerce.bigint().positive().default(100000n),
});
```

- [ ] Escribir pruebas que rechacen secretos cortos, claves AES distintas de 32 bytes y URLs inválidas.
- [ ] Implementar la carga perezosa de variables para no leer secretos al importar componentes cliente.
- [ ] Configurar Pino para redactar `authorization`, `cookie`, `accessToken`, `refreshToken` y `shareToken`.
- [ ] Implementar `/api/health` con comprobación `SELECT 1` y respuesta 503 cuando PostgreSQL no responde.
- [ ] Ejecutar `pnpm --filter @quieroeso/config test` y una prueba de integración del healthcheck.
- [ ] Commit: `feat: add validated configuration and healthcheck`.

### Tarea 3: PostgreSQL, Prisma y autenticación Google

**Archivos:**
- Crear: `packages/db/prisma/schema.prisma`, `packages/db/src/client.ts`, `packages/db/prisma/seed.ts`
- Crear: `apps/web/lib/auth.ts`, `apps/web/lib/auth-client.ts`
- Crear: `apps/web/app/api/auth/[...all]/route.ts`
- Crear: `apps/web/app/(marketing)/login/page.tsx`
- Prueba: `apps/web/lib/auth.test.ts`

**Interfaces:**
- Produce `auth`, `authClient`, `requireUser()` y `prisma` singleton.

- [ ] Definir los modelos de Better Auth y los modelos base `WishList` y `ListItem`.
- [ ] Generar y aplicar la primera migración con `pnpm --filter @quieroeso/db prisma migrate dev --name init`.
- [ ] Configurar Better Auth con adaptador Prisma y proveedor Google.
- [ ] Implementar `requireUser()` para Server Components y Route Handlers.
- [ ] Probar que una sesión válida resuelve usuario y una cookie ausente produce 401 sin redirección en API.
- [ ] Añadir prueba Playwright del flujo usando un proveedor OAuth simulado en entorno de pruebas.
- [ ] Commit: `feat: add Google authentication`.

### Tarea 4: Dominio de listas y publicación atómica

**Archivos:**
- Crear: `packages/domain/src/lists/list-service.ts`, `packages/domain/src/lists/types.ts`
- Crear: `apps/web/app/api/lists/route.ts`, `apps/web/app/api/lists/[id]/route.ts`
- Crear: `apps/web/app/api/lists/[id]/publish/route.ts`
- Prueba: `packages/domain/src/lists/list-service.integration.test.ts`

**Interfaces:**
- Produce `createList`, `updateList`, `publishList`, `getOwnedList`.

```ts
export type PublishListInput = {
  listId: string;
  ownerId: string;
  visibility: "PUBLIC" | "UNLISTED";
};
```

- [ ] Escribir pruebas de autorización por propietario y transiciones de visibilidad.
- [ ] Escribir una prueba concurrente con dos listas del mismo usuario; sólo una debe quedar en `firstPublishedListId`.
- [ ] Implementar `publishList` dentro de una transacción serializable con retry acotado por conflicto.
- [ ] Generar slug público estable y token secreto sólo para `UNLISTED`.
- [ ] Impedir que volver a `PRIVATE` elimine `publishedAt` o reinicie el beneficio.
- [ ] Ejecutar pruebas con PostgreSQL real de test.
- [ ] Commit: `feat: add list lifecycle and atomic publication`.

### Tarea 5: Cupos gratuitos y cálculo de comisión

**Archivos:**
- Crear: `packages/domain/src/fees/fee-policy.ts`, `packages/domain/src/money/money.ts`
- Modificar: `packages/db/prisma/schema.prisma`
- Prueba: `packages/domain/src/fees/fee-policy.integration.test.ts`

**Interfaces:**
- Produce `assignAvailableFreeSlots`, `releaseUnusedSlot`, `consumeSlot`, `calculateFeeMinor`.

- [ ] Escribir pruebas de redondeo para 0%, 1%, importes con centavos y valores grandes.
- [ ] Probar publicación con 0, 5, 8 y 12 productos.
- [ ] Probar que un producto de otra lista recibe 100 bps aunque existan cupos sin usar en la primera.
- [ ] Probar que eliminar un producto sin aportes libera su cupo.
- [ ] Probar que eliminar un producto con aporte aprobado no libera el cupo.
- [ ] Implementar asignación bajo bloqueo de la fila `FreeTierEntitlement` para evitar duplicados.
- [ ] Commit: `feat: implement first-list free product policy`.

### Tarea 6: Importación segura desde Mercado Libre

**Archivos:**
- Crear: `packages/integrations/src/mercadolibre/url-parser.ts`, `client.ts`, `mapper.ts`
- Crear: `apps/web/app/api/lists/[id]/items/import/route.ts`
- Prueba: `packages/integrations/src/mercadolibre/url-parser.test.ts`, `client.contract.test.ts`

**Interfaces:**
- Produce `parseMercadoLibreUrl(url)`, `fetchItemSnapshot(reference)` e `importListItem`.

```ts
export type ProductSnapshotInput = {
  externalId: string;
  kind: "ITEM" | "CATALOG_PRODUCT";
  canonicalUrl: string;
  title: string;
  imageUrl: string | null;
  priceMinor: bigint | null;
  currency: "ARS";
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
};
```

- [ ] Crear fixtures de URL de artículo, catálogo, enlace corto y parámetros de tracking.
- [ ] Probar rechazo de HTTP, credenciales embebidas, hosts parecidos, localhost, redes privadas y más de tres redirecciones.
- [ ] Implementar resolución de `meli.la` con redirección manual y validación en cada salto.
- [ ] Implementar cliente API con timeout de 5 segundos, identificador de request y manejo explícito de 401, 404 y 429.
- [ ] Persistir snapshot y permitir edición de campos de presentación sin alterar datos de origen.
- [ ] Ejecutar contrato contra fixtures grabados sin depender de Mercado Libre durante CI.
- [ ] Commit: `feat: import Mercado Libre products safely`.

### Tarea 7: Dashboard, editor y páginas compartidas

**Archivos:**
- Crear: `apps/web/app/(dashboard)/dashboard/lists/page.tsx`
- Crear: `apps/web/app/(dashboard)/dashboard/lists/[id]/page.tsx`
- Crear: `apps/web/app/l/[slug]/page.tsx`, `apps/web/app/s/[token]/page.tsx`
- Crear: `apps/web/components/list-editor/*`, `apps/web/components/public-list/*`
- Prueba: `tests/e2e/list-visibility.spec.ts`

**Interfaces:**
- Consume servicios de listas e importación; produce vistas accesibles y responsivas.

- [ ] Implementar creación, edición, reordenamiento, importación y archivo de productos.
- [ ] Mostrar antes de publicar si cada producto aplica 0% o 1%.
- [ ] Renderizar `PUBLIC` por slug y `UNLISTED` por token, devolviendo 404 uniforme ante acceso inválido.
- [ ] Añadir `robots: noindex,nofollow` en no listadas y privadas.
- [ ] Probar que sitemap y API pública contienen sólo listas públicas.
- [ ] Probar vistas móviles de 360 px y escritorio de 1440 px con Playwright.
- [ ] Commit: `feat: add list editor and shared pages`.

### Tarea 8: Metadatos, Open Graph y salida para agentes

**Archivos:**
- Crear: `apps/web/app/l/[slug]/opengraph-image.tsx`
- Crear: `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`, `apps/web/app/llms.txt/route.ts`
- Crear: `apps/web/app/api/public/lists/[slug]/route.ts`, `apps/web/app/openapi.json/route.ts`
- Prueba: `apps/web/lib/public-metadata.test.ts`

**Interfaces:**
- Produce JSON-LD `ItemList`, Open Graph, endpoint público y especificación OpenAPI.

- [ ] Escribir pruebas que validen JSON-LD y ausencia de datos personales.
- [ ] Generar imagen OG con título, portada y hasta tres productos.
- [ ] Implementar sitemap sólo para `PUBLIC` y canonical URL estable.
- [ ] Implementar JSON público con caché y `ETag` sin identificadores internos del propietario.
- [ ] Crear `/llms.txt` con descripción, políticas de indexación y enlaces públicos.
- [ ] Validar HTML con axe y JSON-LD con un esquema local.
- [ ] Commit: `feat: add social previews and AI-readable public data`.

### Tarea 9: OAuth de Mercado Pago y cifrado de tokens

**Archivos:**
- Crear: `packages/integrations/src/crypto/token-vault.ts`
- Crear: `packages/integrations/src/mercadopago/oauth.ts`, `client.ts`
- Crear: `apps/web/app/api/integrations/mercadopago/connect/route.ts`
- Crear: `apps/web/app/api/integrations/mercadopago/callback/route.ts`
- Prueba: `packages/integrations/src/crypto/token-vault.test.ts`, `mercadopago/oauth.test.ts`

**Interfaces:**
- Produce `startAuthorization`, `exchangeAuthorizationCode`, `refreshAccessToken`, `encryptToken`, `decryptToken`.

- [ ] Probar round-trip AES-GCM, detección de ciphertext alterado y lectura por versión de clave.
- [ ] Implementar estado OAuth de un solo uso y PKCE con vencimiento de 10 minutos.
- [ ] Intercambiar código sólo desde el servidor y cifrar tokens antes de la transacción de guardado.
- [ ] Renovar access token bajo bloqueo para impedir refresh concurrente.
- [ ] Mostrar estado conectado, expirado o revocado sin presentar secretos.
- [ ] Commit: `feat: connect Mercado Pago accounts securely`.

### Tarea 10: Creación de aportes y Checkout Pro

**Archivos:**
- Crear: `packages/domain/src/contributions/create-contribution.ts`
- Crear: `apps/web/app/api/contributions/route.ts`
- Crear: `apps/web/components/public-list/contribution-dialog.tsx`
- Prueba: `packages/domain/src/contributions/create-contribution.integration.test.ts`

**Interfaces:**
- Produce `createContribution(input): Promise<{ contributionId; checkoutUrl }>`.

```ts
export type CreateContributionInput = {
  listItemId: string;
  amountMinor: bigint;
  contributorName?: string;
  contributorMessage?: string;
};
```

- [ ] Probar rechazo cuando lista no está compartida, aportes están desactivados, producto está archivado o Mercado Pago no está conectado.
- [ ] Probar monto mínimo, máximo igual al saldo pendiente y cálculo 0%/1%.
- [ ] Crear `Contribution` antes de llamar a Mercado Pago y usar su ID como idempotency key.
- [ ] Crear una preferencia de un solo producto con `marketplace_fee` omitido o calculado.
- [ ] Persistir preference ID y devolver únicamente URL de Checkout Pro autorizada.
- [ ] Mostrar importe, comisión de la plataforma y aviso sobre cargos de Mercado Pago antes de redirigir.
- [ ] Commit: `feat: create per-item Mercado Pago checkouts`.

### Tarea 11: Webhooks e historial financiero idempotente

**Archivos:**
- Crear: `packages/domain/src/contributions/process-payment-event.ts`
- Crear: `apps/web/app/api/webhooks/mercadopago/route.ts`
- Crear: `apps/web/app/(dashboard)/dashboard/contributions/page.tsx`
- Prueba: `packages/domain/src/contributions/process-payment-event.integration.test.ts`

**Interfaces:**
- Produce `processPaymentEvent(event): Promise<ProcessResult>` con resultados `PROCESSED`, `DUPLICATE`, `IGNORED`.

- [ ] Crear fixtures firmados válidos e inválidos.
- [ ] Probar duplicado de evento, dos eventos para el mismo pago y transición fuera de orden.
- [ ] Validar firma y persistir `WebhookEvent` antes de responder 200.
- [ ] Consultar el pago en Mercado Pago y comparar monto, moneda, external reference y receptor.
- [ ] Actualizar contribución mediante máquina de estados y marcar cupo gratuito al primer `APPROVED`.
- [ ] Mostrar historial al propietario sin exponer información sensible del pagador.
- [ ] Commit: `feat: process payment webhooks idempotently`.

### Tarea 12: Actualización programada de productos

**Archivos:**
- Crear: `apps/jobs/src/refresh-products.ts`
- Crear: `packages/domain/src/lists/refresh-product-snapshots.ts`
- Prueba: `packages/domain/src/lists/refresh-product-snapshots.integration.test.ts`

**Interfaces:**
- Produce `refreshStaleProducts({batchSize, concurrency, staleBefore})`.

- [ ] Probar selección exclusiva de snapshots con más de 12 horas.
- [ ] Implementar lotes de 50 con lock transaccional para impedir trabajo duplicado.
- [ ] Limitar concurrencia a 5 y aplicar backoff con jitter para 429 y 5xx.
- [ ] Conservar snapshot anterior ante fallo y actualizar `lastSyncError` sanitizado.
- [ ] Marcar `UNAVAILABLE` sólo ante respuesta confirmada 404/estado inactivo.
- [ ] Hacer que el comando termine con 0 si completa y con código distinto de 0 ante fallo sistémico.
- [ ] Commit: `feat: refresh Mercado Libre snapshots on schedule`.

### Tarea 13: Límites de abuso, auditoría y políticas legales mínimas

**Archivos:**
- Crear: `packages/domain/src/security/rate-limit.ts`, `audit-log.ts`
- Crear: `apps/web/app/(marketing)/privacy/page.tsx`, `terms/page.tsx`
- Modificar: endpoints de importación, publicación y aportes
- Prueba: `packages/domain/src/security/rate-limit.integration.test.ts`

**Interfaces:**
- Produce `consumeRateLimit`, `writeAuditEvent` y respuestas 429 consistentes.

- [ ] Implementar ventanas persistidas y limpieza por tarea programada.
- [ ] Probar límites separados por usuario, lista y HMAC de IP.
- [ ] Registrar publicación, conexión/desconexión de Mercado Pago y cambios de modalidad.
- [ ] Añadir consentimiento visible antes de aportar y enlaces a privacidad y términos.
- [ ] Documentar que QuieroEso no custodia fondos y que Mercado Pago procesa el pago.
- [ ] Verificar que logs y auditoría nunca guardan tokens ni enlaces secretos completos.
- [ ] Commit: `feat: add abuse controls and audit trail`.

### Tarea 14: Despliegue en Railway

**Archivos:**
- Crear: `.railway/railway.ts`
- Crear: `apps/web/Dockerfile`, `apps/jobs/Dockerfile`
- Crear: `docs/operations/railway.md`
- Prueba: `scripts/smoke-production.mjs`

**Interfaces:**
- Produce servicios `web`, `postgres` y `jobs-refresh-products` reproducibles.

- [ ] Definir infraestructura Railway con región única, variables referenciadas y red privada a PostgreSQL.
- [ ] Configurar build `pnpm turbo build --filter=@quieroeso/web...` y salida standalone.
- [ ] Configurar migración previa `pnpm --filter @quieroeso/db migrate:deploy`.
- [ ] Configurar healthcheck `/api/health`, timeout de 300 segundos y reinicio `ON_FAILURE`.
- [ ] Configurar cron `17 */6 * * *` para evitar la hora exacta.
- [ ] Crear ambientes staging y production con credenciales separadas de Google, Mercado Libre y Mercado Pago.
- [ ] Ejecutar smoke test de home, healthcheck, login, página pública y creación simulada de checkout.
- [ ] Commit: `chore: define Railway infrastructure and deployment`.

### Tarea 15: Pruebas de aceptación y salida del MVP

**Archivos:**
- Crear: `tests/e2e/mvp-journey.spec.ts`, `tests/e2e/payment-webhook.spec.ts`
- Crear: `docs/operations/release-checklist.md`, `docs/operations/incidents.md`

**Interfaces:**
- Produce evidencia ejecutable de los recorridos críticos.

- [ ] Probar login Google simulado, creación de lista, importación, publicación pública y vista compartida.
- [ ] Probar lista no listada con token correcto, token incorrecto y ausencia en sitemap.
- [ ] Probar primera lista con 9 productos: ocho a 0% y uno a 1%.
- [ ] Probar segunda lista: primer producto a 1%.
- [ ] Probar checkout, webhook aprobado duplicado, rechazo, reembolso y contracargo.
- [ ] Probar pérdida temporal de Mercado Libre y Mercado Pago sin corrupción de datos.
- [ ] Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` y `pnpm build`.
- [ ] Completar medición de calidad y credenciales productivas de Mercado Pago.
- [ ] Verificar SSL, callbacks exactos, backups de PostgreSQL y alertas de Railway.
- [ ] Commit: `test: complete MVP acceptance coverage`.

## Fases de entrega

| Fase | Tareas | Resultado demostrable |
|---|---|---|
| 1. Base | 1–3 | Monorepo desplegable, PostgreSQL y login Google |
| 2. Listas | 4–8 | Listas privadas/públicas, productos ML y vistas previas |
| 3. Pagos | 9–11 | Conexión MP, comisión 0%/1% y aportes confirmados |
| 4. Operación | 12–14 | Actualizaciones, seguridad y Railway reproducible |
| 5. Lanzamiento | 15 | Recorridos críticos verificados y MVP listo |

## Criterios de aceptación del MVP

- Un usuario inicia sesión exclusivamente con Google.
- Puede crear una lista sin Mercado Pago y compartirla como lista de deseos.
- Puede importar un enlace válido de Mercado Libre y ver título, imagen, precio y disponibilidad.
- Puede elegir `PRIVATE`, `UNLISTED` o `PUBLIC` y el acceso coincide con esa elección.
- Puede conectar su propia cuenta de Mercado Pago y habilitar aportes por producto.
- El dinero se acredita directamente en la cuenta conectada.
- La primera lista publicada asigna como máximo ocho productos con comisión 0%.
- El noveno producto de esa lista y todos los productos de listas posteriores aplican 1%.
- Los reintentos de checkout y webhooks no duplican aportes.
- WhatsApp y redes muestran una vista previa útil de la lista.
- Buscadores y asistentes sólo pueden descubrir listas públicas.
- El sistema se despliega en Railway desde el monorepo y pasa healthcheck, migraciones y smoke tests.

## Fuera del MVP

- Aplicaciones móviles nativas.
- Compra directa del artículo en Mercado Libre desde QuieroEso.
- Pagos que combinan varios productos en un checkout.
- División de un pago entre múltiples destinatarios.
- Panel administrativo completo; la operación inicial usa consultas controladas y auditoría.
- Notificaciones por WhatsApp o correo.
- Monedas y países distintos de Argentina/ARS.
- Edición colaborativa de una misma lista.
- Reembolsos iniciados desde QuieroEso.

## Fuentes técnicas verificadas

- Next.js 16.3: https://nextjs.org/blog/next-16-3
- Better Auth con Google: https://better-auth.com/docs/authentication/google
- Monorepos en Railway: https://docs.railway.com/deployments/monorepo
- Infrastructure as Code en Railway: https://docs.railway.com/infrastructure-as-code
- Cron jobs en Railway: https://docs.railway.com/cron-jobs
- Prisma en Railway: https://www.prisma.io/docs/orm/v7/prisma-client/deployment/traditional/deploy-to-railway
- Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect
- Mercado Pago Split 1:1: https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- OAuth de Mercado Pago: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/introduction
- Webhooks de Mercado Pago: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/resources/notifications/webhooks
- Datos estructurados de producto: https://developers.google.com/search/docs/appearance/structured-data/product
- Schema.org `ItemList`: https://schema.org/ItemList
