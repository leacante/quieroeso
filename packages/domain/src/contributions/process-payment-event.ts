import type { ContributionStatus, PrismaClient } from "@quieroeso/db";
import { sha256Hex } from "@quieroeso/integrations/crypto";
import type { MercadoPagoPayment } from "@quieroeso/integrations/mercadopago";
import { getLogger } from "@quieroeso/observability";
import { consumeSlot } from "../fees/fee-policy";
import { toMinorUnits } from "../money/money";

export type ProcessResult = "PROCESSED" | "DUPLICATE" | "IGNORED";

const PROVIDER = "mercadopago";

/** Mercado Pago payment statuses mapped to internal contribution states. */
const STATUS_MAP: Record<string, ContributionStatus> = {
  pending: "PENDING",
  in_process: "PENDING",
  authorized: "PENDING",
  approved: "APPROVED",
  in_mediation: "APPROVED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "CHARGED_BACK",
};

/**
 * Allowed transitions. Terminal states never move; REJECTED/CANCELLED may be
 * followed by a *new* payment attempt on the same preference.
 */
const TRANSITIONS: Record<ContributionStatus, ContributionStatus[]> = {
  CREATED: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  CHECKOUT_CREATED: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  REJECTED: ["PENDING", "APPROVED"],
  CANCELLED: ["PENDING", "APPROVED"],
  APPROVED: ["REFUNDED", "CHARGED_BACK"],
  REFUNDED: [],
  CHARGED_BACK: [],
};

export type WebhookNotification = {
  /** Mercado Pago notification id (body.id); falls back to type/data.id/request id. */
  providerEventId: string;
  topic: string | null;
  resourceId: string | null;
  /** body.user_id: the collector's Mercado Pago user id. */
  collectorId: string | null;
  rawBody: string;
};

export type RecordedEvent = { id: string; status: "NEW" | "RETRY" | "DUPLICATE" };

/**
 * Persists a verified notification before acknowledging it. Already processed
 * events are duplicates; stored but unprocessed events are retried.
 */
export async function recordWebhookEvent(
  db: PrismaClient,
  notification: WebhookNotification,
): Promise<RecordedEvent> {
  const payloadHash = sha256Hex(notification.rawBody);
  const existing = await db.webhookEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: PROVIDER,
        providerEventId: notification.providerEventId,
      },
    },
  });
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      getLogger().warn(
        { webhookEventId: existing.id },
        "notification id reused with a different payload",
      );
    }
    return { id: existing.id, status: existing.processedAt ? "DUPLICATE" : "RETRY" };
  }
  try {
    const created = await db.webhookEvent.create({
      data: {
        provider: PROVIDER,
        providerEventId: notification.providerEventId,
        topic: notification.topic,
        resourceId: notification.resourceId,
        collectorId: notification.collectorId,
        payloadHash,
      },
    });
    return { id: created.id, status: "NEW" };
  } catch {
    // Concurrent delivery of the same event: the other request owns it.
    return { id: "", status: "DUPLICATE" };
  }
}

export type PaymentEventDeps = {
  db: PrismaClient;
  /** Resolves the owner connection for a collector and returns its access token. */
  getAccessTokenForCollector(collectorId: string): Promise<{ accessToken: string } | null>;
  getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment>;
};

async function finish(db: PrismaClient, eventId: string, result: string): Promise<void> {
  if (!eventId) return;
  await db.webhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), result },
  });
}

/**
 * Applies a verified payment notification. The payment is always re-read from
 * Mercado Pago with the collector's token and must match the contribution's
 * external reference, amount, currency and collector before any state change.
 */
export async function processPaymentEvent(
  deps: PaymentEventDeps,
  event: {
    eventId: string;
    topic: string | null;
    paymentId: string | null;
    collectorId: string | null;
  },
): Promise<ProcessResult> {
  const logger = getLogger().child({ webhookEventId: event.eventId, paymentId: event.paymentId });
  if (event.topic !== "payment" || !event.paymentId || !/^\d{1,20}$/.test(event.paymentId)) {
    await finish(deps.db, event.eventId, "IGNORED_TOPIC");
    return "IGNORED";
  }

  const collectorId =
    event.collectorId ??
    (
      await deps.db.contribution.findUnique({
        where: { mpPaymentId: event.paymentId },
        select: { collectorId: true },
      })
    )?.collectorId ??
    null;
  const connection = collectorId ? await deps.getAccessTokenForCollector(collectorId) : null;
  if (!connection) {
    logger.warn("payment notification for unknown or inactive collector");
    await finish(deps.db, event.eventId, "IGNORED_COLLECTOR");
    return "IGNORED";
  }

  // Network errors propagate: the event stays unprocessed and is retried later.
  const payment = await deps.getPayment(connection.accessToken, event.paymentId);
  const contribution = payment.external_reference
    ? await deps.db.contribution.findUnique({ where: { id: payment.external_reference } })
    : null;
  if (!contribution) {
    logger.warn("payment without a matching contribution");
    await finish(deps.db, event.eventId, "IGNORED_REFERENCE");
    return "IGNORED";
  }

  const amountMatches = toMinorUnits(payment.transaction_amount) === contribution.amountMinor;
  if (
    !amountMatches ||
    payment.currency_id !== contribution.currency ||
    payment.collector_id !== contribution.collectorId
  ) {
    logger.error({ contributionId: contribution.id }, "payment does not match its contribution");
    await finish(deps.db, event.eventId, "IGNORED_MISMATCH");
    return "IGNORED";
  }

  const next = STATUS_MAP[payment.status];
  if (!next) {
    await finish(deps.db, event.eventId, "IGNORED_STATUS");
    return "IGNORED";
  }

  const result = await deps.db.$transaction(async (tx): Promise<ProcessResult> => {
    await tx.$queryRaw`SELECT "id" FROM "Contribution" WHERE "id" = ${contribution.id} FOR UPDATE`;
    const current = await tx.contribution.findUniqueOrThrow({ where: { id: contribution.id } });
    const samePayment = current.mpPaymentId === payment.id;

    if (current.status === next && (samePayment || current.mpPaymentId === null))
      return "DUPLICATE";

    const allowed = TRANSITIONS[current.status].includes(next);
    // A different payment may settle a not-yet-approved contribution (e.g. a pending cash
    // ticket followed by a card payment); refunds and chargebacks must match the approved one.
    const paymentOk = samePayment || current.mpPaymentId === null || current.status !== "APPROVED";
    if (!allowed || !paymentOk) {
      if (next === "APPROVED" && current.status === "APPROVED" && !samePayment) {
        logger.error(
          { contributionId: current.id },
          "second approved payment for one contribution",
        );
      }
      return "IGNORED";
    }

    const approvedAt =
      next === "APPROVED" ? (current.approvedAt ?? new Date()) : current.approvedAt;
    await tx.contribution.update({
      where: { id: current.id },
      data: {
        status: next,
        mpPaymentId: payment.id,
        mpStatusDetail: payment.status_detail ?? null,
        approvedAt,
      },
    });
    if (next === "APPROVED") {
      // The first approved contribution consumes the item's free slot forever.
      await consumeSlot(tx, current.listItemId, approvedAt ?? new Date());
    }
    return "PROCESSED";
  });

  await finish(deps.db, event.eventId, result);
  logger.info({ contributionId: contribution.id, status: next, result }, "payment event applied");
  return result;
}

/** Re-runs stored notifications that were acknowledged but not processed (e.g. after an outage). */
export async function processPendingWebhookEvents(
  deps: PaymentEventDeps,
  options: { olderThanMs?: number; limit?: number } = {},
): Promise<{ processed: number; failed: number }> {
  const events = await deps.db.webhookEvent.findMany({
    where: {
      provider: PROVIDER,
      processedAt: null,
      createdAt: { lt: new Date(Date.now() - (options.olderThanMs ?? 60_000)) },
    },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 100,
  });
  let processed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await processPaymentEvent(deps, {
        eventId: event.id,
        topic: event.topic,
        paymentId: event.resourceId,
        collectorId: event.collectorId,
      });
      processed++;
    } catch (error) {
      failed++;
      getLogger().warn({ err: error, webhookEventId: event.id }, "webhook reprocessing failed");
    }
  }
  return { processed, failed };
}
