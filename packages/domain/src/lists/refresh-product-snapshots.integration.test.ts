import {
  MercadoLibreApiError,
  type MercadoLibreGateway,
  type MercadoLibreReference,
} from "@quieroeso/integrations/mercadolibre";
import { describe, expect, it, vi } from "vitest";
import { createTestUser, itemData, useTestDatabase } from "../testing/fixtures";
import { insertItem } from "./item-service";
import { createList } from "./list-service";
import { refreshStaleProducts, SystemicRefreshError } from "./refresh-product-snapshots";

const ctx = useTestDatabase();
const HOUR = 3600_000;

async function seedItems(count: number, syncedHoursAgo: number, prefix = "MLA10000000") {
  const owner = await createTestUser(ctx.db);
  const list = await createList(ctx.db, owner.id, { title: "Refresh" });
  const items = [];
  for (let index = 0; index < count; index++) {
    const externalId = `${prefix}${String(index).padStart(2, "0")}`;
    items.push(
      await insertItem(
        ctx.db,
        { listId: list.id, ownerId: owner.id },
        itemData({
          sourceType: "MERCADOLIBRE",
          externalId,
          externalKind: "ITEM",
          sourceUrl: `https://articulo.mercadolibre.com.ar/${externalId}`,
          title: "Título original",
          imageUrl: "https://http2.mlstatic.com/old.jpg",
          sourceSnapshot: {
            title: "Título original",
            imageUrl: "https://http2.mlstatic.com/old.jpg",
            priceMinor: "100000",
          },
          priceMinor: 100_000n,
          availability: "AVAILABLE",
          lastSyncedAt: new Date(Date.now() - syncedHoursAgo * HOUR),
        }),
      ),
    );
  }
  return items;
}

function gateway(behavior: (reference: MercadoLibreReference) => Promise<void> | void = () => {}) {
  return {
    fetchSnapshot: vi.fn(async (reference: MercadoLibreReference) => {
      await behavior(reference);
      return {
        externalId: reference.externalId,
        kind: reference.kind,
        canonicalUrl: reference.canonicalUrl,
        title: "Título nuevo",
        imageUrl: "https://http2.mlstatic.com/new.jpg",
        priceMinor: 120_000n,
        currency: "ARS" as const,
        availability: "AVAILABLE" as const,
      };
    }),
  } satisfies MercadoLibreGateway;
}

const noSleep = vi.fn(async () => {});

describe("refreshStaleProducts", () => {
  it("refreshes only snapshots older than 12 hours", async () => {
    const stale = await seedItems(3, 13);
    const fresh = await seedItems(2, 1, "MLA20000000");
    const meli = gateway();
    const summary = await refreshStaleProducts({ db: ctx.db, meli, sleep: noSleep });
    expect(summary).toMatchObject({ claimed: 3, refreshed: 3, failed: 0 });
    expect(meli.fetchSnapshot).toHaveBeenCalledTimes(3);

    const staleRow = await ctx.db.listItem.findUniqueOrThrow({ where: { id: stale[0]!.id } });
    expect(staleRow).toMatchObject({
      priceMinor: 120_000n,
      title: "Título nuevo",
      syncClaimedAt: null,
      lastSyncError: null,
    });
    const freshRow = await ctx.db.listItem.findUniqueOrThrow({ where: { id: fresh[0]!.id } });
    expect(freshRow.priceMinor).toBe(100_000n);
  });

  it("keeps owner customizations of title and image", async () => {
    const [item] = await seedItems(1, 13);
    await ctx.db.listItem.update({ where: { id: item!.id }, data: { title: "Mi cafetera" } });
    await refreshStaleProducts({ db: ctx.db, meli: gateway(), sleep: noSleep });
    const row = await ctx.db.listItem.findUniqueOrThrow({ where: { id: item!.id } });
    expect(row).toMatchObject({
      title: "Mi cafetera",
      imageUrl: "https://http2.mlstatic.com/new.jpg",
      priceMinor: 120_000n,
    });
  });

  it("adopts the first known price as target only for items imported without one", async () => {
    const [unpriced, cleared] = await seedItems(2, 13);
    await ctx.db.listItem.update({
      where: { id: unpriced!.id },
      data: {
        priceMinor: null,
        targetAmountMinor: null,
        sourceSnapshot: { title: "Título original", priceMinor: null },
      },
    });
    await ctx.db.listItem.update({
      where: { id: cleared!.id },
      data: { targetAmountMinor: null },
    });
    await refreshStaleProducts({ db: ctx.db, meli: gateway(), sleep: noSleep });

    const adopted = await ctx.db.listItem.findUniqueOrThrow({ where: { id: unpriced!.id } });
    expect(adopted).toMatchObject({ priceMinor: 120_000n, targetAmountMinor: 120_000n });
    const kept = await ctx.db.listItem.findUniqueOrThrow({ where: { id: cleared!.id } });
    expect(kept).toMatchObject({ priceMinor: 120_000n, targetAmountMinor: null });
  });

  it("processes batches of 50 with at most 5 concurrent requests", async () => {
    await seedItems(60, 20);
    let inFlight = 0;
    let peak = 0;
    const meli = gateway(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    });
    const summary = await refreshStaleProducts({ db: ctx.db, meli, sleep: noSleep });
    expect(summary.refreshed).toBe(60);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("two concurrent workers never refresh the same item", async () => {
    await seedItems(30, 20);
    const seen: string[] = [];
    const meli = gateway(async (reference) => {
      seen.push(reference.externalId);
      await new Promise((resolve) => setTimeout(resolve, 3));
    });
    await Promise.all([
      refreshStaleProducts({ db: ctx.db, meli, sleep: noSleep }, { batchSize: 10 }),
      refreshStaleProducts({ db: ctx.db, meli, sleep: noSleep }, { batchSize: 10 }),
    ]);
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it("backs off with jitter on 429 and keeps the snapshot when it keeps failing", async () => {
    const [flaky, broken] = await seedItems(2, 20);
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const meli = gateway((reference) => {
      if (reference.externalId === flaky!.externalId && calls++ < 2) {
        throw new MercadoLibreApiError("RATE_LIMITED", 429, null);
      }
      if (reference.externalId === broken!.externalId)
        throw new MercadoLibreApiError("UPSTREAM", 503);
    });
    const summary = await refreshStaleProducts({ db: ctx.db, meli, sleep, random: () => 0.5 });
    expect(summary).toMatchObject({ refreshed: 1, failed: 1 });
    expect(sleep).toHaveBeenCalledWith(250);
    const brokenRow = await ctx.db.listItem.findUniqueOrThrow({ where: { id: broken!.id } });
    expect(brokenRow).toMatchObject({
      priceMinor: 100_000n,
      title: "Título original",
      lastSyncError: "UPSTREAM",
      syncClaimedAt: null,
    });
  });

  it("marks items unavailable only on a confirmed 404", async () => {
    const [gone] = await seedItems(1, 20);
    await refreshStaleProducts({
      db: ctx.db,
      meli: gateway(() => {
        throw new MercadoLibreApiError("NOT_FOUND", 404);
      }),
      sleep: noSleep,
    });
    const row = await ctx.db.listItem.findUniqueOrThrow({ where: { id: gone!.id } });
    expect(row).toMatchObject({
      availability: "UNAVAILABLE",
      lastSyncError: "NOT_FOUND",
      priceMinor: 100_000n,
    });
    expect(row.archivedAt).toBeNull();
  });

  it("fails systemically when credentials are rejected", async () => {
    await seedItems(3, 20);
    await expect(
      refreshStaleProducts({
        db: ctx.db,
        meli: gateway(() => {
          throw new MercadoLibreApiError("UNAUTHORIZED", 401);
        }),
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(SystemicRefreshError);
  });
});
