# Checklist de lanzamiento del MVP

Marcar cada punto antes de abrir producción. Los ítems ✅ ya están cubiertos por el
repositorio; el resto requiere acciones en cuentas externas.

## Código y pruebas

- [x] `pnpm lint && pnpm typecheck && pnpm test` en verde.
- [x] `pnpm test:integration` en verde (PostgreSQL real).
- [x] `pnpm test:e2e` en verde contra `docker compose up --build`.
- [x] `pnpm build` en verde.
- [x] Accesibilidad WCAG 2 AA (axe) en home, login, lista pública, no listada y editor.

## Marca y dominio

- [ ] Elegir nombre y dominio definitivos (ver tabla del plan) y **re-verificar disponibilidad**.
- [ ] Registrar el dominio y configurarlo en Railway (`domains` en `.railway/railway.ts`).
- [ ] Actualizar `APP_URL` / `BETTER_AUTH_URL` y los textos de marca.

## Proveedores (credenciales separadas para staging y producción)

- [ ] Google OAuth: cliente web, URI `${APP_URL}/api/auth/callback/google`, pantalla de consentimiento publicada.
- [ ] Mercado Libre: aplicación propia (separada de la de Mercado Pago), validar que el
      grant `client_credentials` devuelve token y que `/items` y `/products` responden.
- [ ] Mercado Pago: aplicación Marketplace con OAuth, redirect exacto, webhook de _Pagos_,
      `MP_WEBHOOK_SECRET` cargado; completar la **medición de calidad** de la integración y
      pasar a credenciales productivas.
- [ ] Probar en sandbox: pago aprobado, pendiente, rechazado, reembolso y contracargo.

## Infraestructura

- [ ] `railway config plan` revisado y aplicado en staging, luego en producción.
- [ ] SSL activo en el dominio; cookies `Secure` verificadas (`scripts/smoke-production.mjs`).
- [ ] Backups diarios de PostgreSQL habilitados y **restauración probada**.
- [ ] Alertas de Railway: deploy fallido, healthcheck, cron con código ≠ 0.
- [ ] `node scripts/smoke-production.mjs ${APP_URL}` 9/9 PASS.

## Legal

- [ ] Revisión legal de términos y privacidad (hoy marcadas como provisionales).
- [ ] Política de conservación de datos financieros definida.
