# ADR 0003 — Data model and deviations from the MVP plan

- Status: accepted
- Date: 2026-09-24

## Additions to the planned schema

| Change                                                                                                                                              | Why                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WishList.shareTokenEncrypted` (AES-256-GCM, AAD = list id) next to `shareTokenHash`                                                                | Owners can copy their unlisted link again; lookups still use SHA-256 only (product decision, 2026-09-24).                                                                      |
| `WishList.archivedAt`, owner relation with `Restrict`                                                                                               | Lists are soft-deleted; they may hold financial history or be the promotional list.                                                                                            |
| `ListItem.sourceSnapshot` (JSON), `externalKind`, `lastSyncError`, `syncClaimedAt`; enums for source and availability                               | Keep source data separate from owner edits; claim-based refresh without duplicate work.                                                                                        |
| `FreeProductSlot.assignedAt`                                                                                                                        | Traceability of slot assignment.                                                                                                                                               |
| `MercadoPagoConnection`: status enum, `liveMode`, `scope`, `lastRefreshedAt`; `mercadoPagoUserId` unique **only among ACTIVE rows** (partial index) | A disconnected account can later be connected by another user; one active owner at a time.                                                                                     |
| `OAuthState`                                                                                                                                        | Single-use hashed `state` + encrypted PKCE verifier, 10-minute expiry.                                                                                                         |
| `Contribution.collectorId`, `mpStatusDetail`; `idempotencyKey` is the client `Idempotency-Key`                                                      | Payment verification against the collector; retries of the checkout request return the same contribution. `X-Idempotency-Key` sent to Mercado Pago is still `contribution.id`. |
| `WebhookEvent.topic/resourceId/collectorId/result`                                                                                                  | Retry of acknowledged-but-unprocessed events and diagnostics.                                                                                                                  |
| `RateLimitBucket`, `AuditEvent`                                                                                                                     | Tasks 13 (abuse controls, audit).                                                                                                                                              |

All business models landed in one migration (`business_models`) instead of one per task.

## Behavioural decisions not fixed by the plan

- **Remaining balance** for a contribution = target − approved − reservations (CREATED,
  CHECKOUT_CREATED, PENDING younger than 30 minutes), checked under an item row lock.
- **Default target** = imported price, editable; manual items need a target to accept
  contributions.
- **Released free slots** go to items added _afterwards_; existing 1% items are never
  upgraded retroactively (predictable fees for owners).
- **Unlisted access to contributions** requires the secret token in the request.
- **Webhook signatures** are verified without a timestamp window: replays are harmless
  because processing is idempotent and the payment is always re-read from Mercado Pago.
- **Second approved payment** for one contribution is never credited; it is logged as an
  error for manual refund (see incidents runbook).

## Tooling deviations

- ESLint 9 + TypeScript 6 shim for lint (ADR 0002).
- Commands in Railway differ from the plan (standalone server, `migrate` script); see
  `docs/operations/railway.md`.
- Local development and E2E use `apps/mock-providers` (ADR 0001).
