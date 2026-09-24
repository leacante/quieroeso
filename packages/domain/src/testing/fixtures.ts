import { randomBytes } from "node:crypto";
import { createPrismaClient, type PrismaClient } from "@quieroeso/db";
import { createTestUser, resetDatabase } from "@quieroeso/db/testing";
import { createTokenVault } from "@quieroeso/integrations/crypto";
import { afterAll, beforeEach } from "vitest";
import { insertItem, type NewItemData } from "../lists/item-service";
import { createList } from "../lists/list-service";
import type { ListDeps } from "../lists/types";

export const testVault = createTokenVault(new Map([[1, randomBytes(32)]]), 1);

/** Shared Prisma client + per-test truncation for an integration test file. */
export function useTestDatabase(): { readonly db: PrismaClient; readonly deps: ListDeps } {
  const db = createPrismaClient(process.env.TEST_DATABASE_URL);
  beforeEach(async () => {
    await resetDatabase(db);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  return { db, deps: { db, vault: testVault } };
}

export { createTestUser };

export function itemData(overrides: Partial<NewItemData> = {}): NewItemData {
  return {
    sourceType: "MANUAL",
    sourceUrl: null,
    externalId: null,
    externalKind: null,
    title: "Producto de prueba",
    notes: null,
    imageUrl: null,
    sourceSnapshot: null,
    priceMinor: 100_000n,
    targetAmountMinor: null,
    availability: "UNKNOWN",
    lastSyncedAt: null,
    ...overrides,
  };
}

/** Creates a list with `count` manual items for `ownerId`. */
export async function createListWithItems(
  db: PrismaClient,
  ownerId: string,
  count: number,
  title = "Lista",
) {
  const list = await createList(db, ownerId, { title });
  const items = [];
  for (let index = 0; index < count; index++) {
    items.push(
      await insertItem(
        db,
        { listId: list.id, ownerId },
        itemData({ title: `${title} #${index + 1}` }),
      ),
    );
  }
  return { list, items };
}

/** Inserts a contribution row in the given state (bypasses Mercado Pago). */
export async function createContributionRow(
  db: PrismaClient,
  listItemId: string,
  status: "CREATED" | "APPROVED" | "REJECTED" = "APPROVED",
) {
  return db.contribution.create({
    data: {
      listItemId,
      amountMinor: 100_000n,
      status,
      platformFeeRateBps: 0,
      platformFeeAmountMinor: 0n,
      collectorId: "1001",
      idempotencyKey: `test-${randomBytes(8).toString("hex")}`,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });
}
