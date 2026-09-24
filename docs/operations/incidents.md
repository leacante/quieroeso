# Runbook de incidentes

Principios: los webhooks verificados son la fuente de verdad de los pagos; nunca se
modifican estados financieros a mano sin dejar registro; los logs no contienen secretos.

## Mercado Pago no responde

- Síntoma: `POST /api/contributions` devuelve 503 con `Retry-After`; logs
  `mercadopago request failed`.
- Impacto: no se crean checkouts; no hay cobros parciales (el aporte queda `CREATED` o
  `CANCELLED` y libera su reserva a los 30 minutos).
- Acción: esperar la recuperación. Los webhooks recibidos durante la caída quedan en
  `WebhookEvent` sin `processedAt` y el cron `jobs-refresh-products` los reprocesa
  (también se puede ejecutar el job `cleanup` a mano).

## Webhooks rechazados por firma

- Síntoma: logs `rejected webhook with invalid signature` para tráfico legítimo.
- Causa probable: `MP_WEBHOOK_SECRET` distinto al de la aplicación de Mercado Pago.
- Acción: corregir el secreto; Mercado Pago reintenta las notificaciones fallidas.

## Pago aprobado dos veces para un mismo aporte

- Síntoma: log `second approved payment for one contribution`.
- Acción: el segundo pago **no** se acredita en QuieroEso. Contactar a quien armó la lista y
  reembolsar el pago duplicado desde Mercado Pago.

## Pago que no coincide con su aporte

- Síntoma: `WebhookEvent.result = IGNORED_MISMATCH` y log `payment does not match its contribution`.
- Acción: investigar posible manipulación (monto, moneda o receptor distintos). No actualizar
  el aporte manualmente.

## Conexión de Mercado Pago revocada

- Síntoma: panel muestra "Revocada"; logs de `invalid_grant` al renovar.
- Acción: la persona debe reconectar su cuenta. Las listas dejan de aceptar aportes hasta entonces.

## Mercado Libre limita o falla

- Síntoma: importaciones con 503; `ListItem.lastSyncError = RATE_LIMITED | UPSTREAM`.
- Acción: el cron reintenta con backoff; los snapshots previos se conservan. Si persiste
  `UNAUTHORIZED`, revisar `MELI_CLIENT_ID/SECRET` (el job termina con código 1).

## Filtración sospechada de un enlace no listado

- Acción: la persona dueña genera un enlace nuevo desde el editor ("Generar enlace nuevo");
  el anterior deja de funcionar al instante.

## Compromiso de la clave de cifrado

- Acción: rotar a `TOKEN_ENCRYPTION_KEY_V2` (ver `railway.md`), pedir reconexión de Mercado
  Pago a todas las cuentas y regenerar enlaces no listados.
