import { randomUUID } from "node:crypto";
import type { MercadoPagoPayment } from "@quieroeso/integrations/mercadopago";
import { describe, expect, it, vi } from "vitest";
import { insertItem, removeItem } from "../lists/item-service";
import { createList, publishList } from "../lists/list-service";
import { createTestUser, itemData, useTestDatabase } from "../testing/fixtures";
import {
  processPaymentEvent,
  processPendingWebhookEvents,
  recordWebhookEvent,
  type PaymentEventDeps,
} from "./process-payment-event";

const ctx = useTestDatabase();

/** In-memory Mercado Pago: payments by id, readable only with the collector's token. */
function fakeMercadoPago() {
  const payments = new Map<string, MercadoPagoPayment>();
  const deps: PaymentEventDeps = {
    db: ctx.db,
    getAccessTokenForCollector: vi.fn(async (collectorId: string) =>
      collectorId === "1001" ? { accessToken: "token-1001" } : null,
    ),
    getPayment: vi.fn(async (_token: string, id: string) => {
      const payment = payments.get(id);
      if (!payment) throw new Error("not found");
      return { ...payment };
    }),
  };
  const setPayment = (
    id: string,
    contributionId: string,
    status: string,
    overrides: Partial<MercadoPagoPayment> = {},
  ) =>
    payments.set(id, {
      id,
      status,
      status_detail: null,
      transaction_amount: 1000,
      currency_id: "ARS",
      external_reference: contributionId,
      collector_id: "1001",
      date_approved: null,
      ...overrides,
    });
  return { deps, setPayment };
}

async function setup() {
  const owner = await createTestUser(ctx.db);
  const list = await createList(ctx.db, owner.id, { title: "Lista" });
  const ref = { listId: list.id, ownerId: owner.id };
  const item = await insertItem(ctx.db, ref, itemData({ priceMinor: 500_000n }));
  await publishList(ctx.deps, { ...ref, visibility: "PUBLIC" });
  const contribution = await ctx.db.contribution.create({
    data: {
      listItemId: item.id,
      amountMinor: 100_000n,
      status: "CHECKOUT_CREATED",
      platformFeeRateBps: 0,
      platformFeeAmountMinor: 0n,
      collectorId: "1001",
      idempotencyKey: randomUUID(),
    },
  });
  return { ref, item, contribution };
}

let eventCounter = 0;
async function deliver(
  deps: PaymentEventDeps,
  paymentId: string,
  eventId = `evt-${++eventCounter}`,
) {
  const recorded = await recordWebhookEvent(ctx.db, {
    providerEventId: eventId,
    topic: "payment",
    resourceId: paymentId,
    collectorId: "1001",
    rawBody: JSON.stringify({ id: eventId, data: { id: paymentId } }),
  });
  if (recorded.status === "DUPLICATE") return "DUPLICATE" as const;
  return processPaymentEvent(deps, {
    eventId: recorded.id,
    topic: "payment",
    paymentId,
    collectorId: "1001",
  });
}

const statusOf = async (id: string) =>
  (await ctx.db.contribution.findUniqueOrThrow({ where: { id } })).status;

describe("processPaymentEvent", () => {
  it("approves once and consumes the free slot", async () => {
    const { item, contribution } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9001", contribution.id, "approved");

    expect(await deliver(mp.deps, "9001")).toBe("PROCESSED");
    const row = await ctx.db.contribution.findUniqueOrThrow({ where: { id: contribution.id } });
    expect(row).toMatchObject({ status: "APPROVED", mpPaymentId: "9001" });
    expect(row.approvedAt).not.toBeNull();
    const slot = await ctx.db.freeProductSlot.findUniqueOrThrow({ where: { listItemId: item.id } });
    expect(slot.consumedAt).not.toBeNull();
  });

  it("treats a repeated event id as a duplicate", async () => {
    const { contribution } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9002", contribution.id, "approved");
    expect(await deliver(mp.deps, "9002", "evt-dup")).toBe("PROCESSED");
    expect(await deliver(mp.deps, "9002", "evt-dup")).toBe("DUPLICATE");
    expect(await ctx.db.webhookEvent.count({ where: { providerEventId: "evt-dup" } })).toBe(1);
  });

  it("two different events for the same approved payment credit once", async () => {
    const { contribution } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9003", contribution.id, "approved");
    expect(await deliver(mp.deps, "9003")).toBe("PROCESSED");
    expect(await deliver(mp.deps, "9003")).toBe("DUPLICATE");
    const approved = await ctx.db.contribution.aggregate({
      where: { status: "APPROVED" },
      _sum: { amountMinor: true },
      _count: true,
    });
    expect(approved).toMatchObject({ _count: 1, _sum: { amountMinor: 100_000n } });
  });

  it("ignores out-of-order transitions", async () => {
    const { contribution } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9004", contribution.id, "approved");
    await deliver(mp.deps, "9004");
    // A late "pending" read (e.g. a replayed notification against a stale mirror) cannot go back.
    mp.setPayment("9004", contribution.id, "pending");
    expect(await deliver(mp.deps, "9004")).toBe("IGNORED");
    expect(await statusOf(contribution.id)).toBe("APPROVED");
  });

  it("moves approved contributions to refunded and charged back, keeping the slot consumed", async () => {
    const { item, contribution, ref } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9005", contribution.id, "approved");
    await deliver(mp.deps, "9005");
    mp.setPayment("9005", contribution.id, "refunded");
    expect(await deliver(mp.deps, "9005")).toBe("PROCESSED");
    expect(await statusOf(contribution.id)).toBe("REFUNDED");

    expect(await removeItem(ctx.db, { ...ref, itemId: item.id })).toBe("ARCHIVED");
    const slot = await ctx.db.freeProductSlot.findUniqueOrThrow({ where: { listItemId: item.id } });
    expect(slot.consumedAt).not.toBeNull();

    const second = await setup();
    mp.setPayment("9006", second.contribution.id, "approved");
    await deliver(mp.deps, "9006");
    mp.setPayment("9006", second.contribution.id, "charged_back");
    expect(await deliver(mp.deps, "9006")).toBe("PROCESSED");
    expect(await statusOf(second.contribution.id)).toBe("CHARGED_BACK");
  });

  it("accepts a new payment after a rejection, and a card payment after a pending ticket", async () => {
    const { contribution } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9007", contribution.id, "rejected");
    await deliver(mp.deps, "9007");
    expect(await statusOf(contribution.id)).toBe("REJECTED");
    mp.setPayment("9008", contribution.id, "pending");
    await deliver(mp.deps, "9008");
    mp.setPayment("9009", contribution.id, "approved");
    expect(await deliver(mp.deps, "9009")).toBe("PROCESSED");
    expect(
      await ctx.db.contribution.findUniqueOrThrow({ where: { id: contribution.id } }),
    ).toMatchObject({
      status: "APPROVED",
      mpPaymentId: "9009",
    });
    // A second approved payment for the same contribution is never credited twice.
    mp.setPayment("9008", contribution.id, "approved");
    expect(await deliver(mp.deps, "9008")).toBe("IGNORED");
  });

  it("rejects payments whose amount, currency, collector or reference do not match", async () => {
    const { contribution } = await setup();
    const mp = fakeMercadoPago();
    mp.setPayment("9010", contribution.id, "approved", { transaction_amount: 999.99 });
    mp.setPayment("9011", contribution.id, "approved", { currency_id: "USD" });
    mp.setPayment("9012", contribution.id, "approved", { collector_id: "6666" });
    mp.setPayment("9013", "unknown-contribution", "approved");
    for (const id of ["9010", "9011", "9012", "9013"]) {
      expect(await deliver(mp.deps, id)).toBe("IGNORED");
    }
    expect(await statusOf(contribution.id)).toBe("CHECKOUT_CREATED");
    expect(
      (await ctx.db.webhookEvent.findMany({ orderBy: { createdAt: "asc" } })).map(
        (event) => event.result,
      ),
    ).toEqual(["IGNORED_MISMATCH", "IGNORED_MISMATCH", "IGNORED_MISMATCH", "IGNORED_REFERENCE"]);
  });

  it("ignores non-payment topics and unknown collectors", async () => {
    const mp = fakeMercadoPago();
    const recorded = await recordWebhookEvent(ctx.db, {
      providerEventId: "evt-merchant",
      topic: "merchant_order",
      resourceId: "123",
      collectorId: "1001",
      rawBody: "{}",
    });
    expect(
      await processPaymentEvent(mp.deps, {
        eventId: recorded.id,
        topic: "merchant_order",
        paymentId: "123",
        collectorId: "1001",
      }),
    ).toBe("IGNORED");
    expect(
      await processPaymentEvent(mp.deps, {
        eventId: "",
        topic: "payment",
        paymentId: "1",
        collectorId: "4040",
      }),
    ).toBe("IGNORED");
  });

  it("keeps events unprocessed when Mercado Pago is down and reprocesses them later", async () => {
    const { contribution } = await setup();
    const mp = fakeMercadoPago();
    const recorded = await recordWebhookEvent(ctx.db, {
      providerEventId: "evt-outage",
      topic: "payment",
      resourceId: "9020",
      collectorId: "1001",
      rawBody: "{}",
    });
    await expect(
      processPaymentEvent(mp.deps, {
        eventId: recorded.id,
        topic: "payment",
        paymentId: "9020",
        collectorId: "1001",
      }),
    ).rejects.toThrow();
    expect(
      await ctx.db.webhookEvent.findUniqueOrThrow({ where: { id: recorded.id } }),
    ).toMatchObject({
      processedAt: null,
    });

    mp.setPayment("9020", contribution.id, "approved");
    const summary = await processPendingWebhookEvents(mp.deps, { olderThanMs: 0 });
    expect(summary).toEqual({ processed: 1, failed: 0 });
    expect(await statusOf(contribution.id)).toBe("APPROVED");
  });
});
