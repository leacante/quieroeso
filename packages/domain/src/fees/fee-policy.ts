import type { PrismaClient, TransactionClient } from "@quieroeso/db";
import { PLATFORM_FEE_BPS } from "../money/money";

export { calculateFeeMinor } from "../money/money";

/** Number of 0% product slots granted to a user's first published list. */
export const FREE_SLOT_COUNT = 8;

type Entitlement = { id: string; userId: string; firstPublishedListId: string };

/**
 * Locks the user's entitlement row (if any) for the rest of the transaction, so
 * concurrent slot assignment for the same user is serialized.
 */
export async function lockEntitlement(
  tx: TransactionClient,
  userId: string,
): Promise<Entitlement | null> {
  const rows = await tx.$queryRaw<Entitlement[]>`
    SELECT "id", "userId", "firstPublishedListId"
    FROM "FreeTierEntitlement"
    WHERE "userId" = ${userId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Returns the user's entitlement, creating it for `listId` when none exists.
 * Creation is irreversible: the first list to be published keeps the promotion.
 * The unique `userId` constraint is the final arbiter of concurrent first publications.
 */
export async function ensureEntitlement(
  tx: TransactionClient,
  userId: string,
  listId: string,
): Promise<{ entitlement: Entitlement; created: boolean }> {
  const existing = await lockEntitlement(tx, userId);
  if (existing) return { entitlement: existing, created: false };

  const entitlement = await tx.freeTierEntitlement.create({
    data: {
      userId,
      firstPublishedListId: listId,
      slots: {
        create: Array.from({ length: FREE_SLOT_COUNT }, (_, index) => ({ slotNumber: index + 1 })),
      },
    },
    select: { id: true, userId: true, firstPublishedListId: true },
  });
  return { entitlement, created: true };
}

/**
 * Assigns free slots (lowest slot number first) to the given items, in order,
 * while unassigned slots remain. Items already holding a slot are skipped.
 * Must run after `lockEntitlement`/`ensureEntitlement` in the same transaction.
 */
export async function assignAvailableFreeSlots(
  tx: TransactionClient,
  entitlementId: string,
  itemIdsInOrder: string[],
): Promise<string[]> {
  if (itemIdsInOrder.length === 0) return [];
  const [freeSlots, alreadyAssigned] = await Promise.all([
    tx.freeProductSlot.findMany({
      where: { entitlementId, listItemId: null, consumedAt: null },
      orderBy: { slotNumber: "asc" },
      select: { id: true },
    }),
    tx.freeProductSlot.findMany({
      where: { listItemId: { in: itemIdsInOrder } },
      select: { listItemId: true },
    }),
  ]);
  const holding = new Set(alreadyAssigned.map((slot) => slot.listItemId));
  const candidates = itemIdsInOrder.filter((id) => !holding.has(id));

  const assigned: string[] = [];
  const now = new Date();
  for (const [index, slot] of freeSlots.entries()) {
    const itemId = candidates[index];
    if (!itemId) break;
    await tx.freeProductSlot.update({
      where: { id: slot.id },
      data: { listItemId: itemId, assignedAt: now, releasedAt: null },
    });
    await tx.listItem.update({
      where: { id: itemId },
      data: { feeRateBps: PLATFORM_FEE_BPS.FREE },
    });
    assigned.push(itemId);
  }
  return assigned;
}

/**
 * Gives a newly created item a free slot when it belongs to the owner's promotional
 * list and a slot is available. Returns the item's resulting fee rate.
 */
export async function assignSlotToNewItem(
  tx: TransactionClient,
  params: { ownerId: string; listId: string; itemId: string },
): Promise<number> {
  const entitlement = await lockEntitlement(tx, params.ownerId);
  if (!entitlement || entitlement.firstPublishedListId !== params.listId) {
    return PLATFORM_FEE_BPS.STANDARD;
  }
  const assigned = await assignAvailableFreeSlots(tx, entitlement.id, [params.itemId]);
  return assigned.length > 0 ? PLATFORM_FEE_BPS.FREE : PLATFORM_FEE_BPS.STANDARD;
}

/**
 * Releases the item's slot unless it was consumed by an approved contribution.
 * Returns true when a slot was released.
 */
export async function releaseUnusedSlot(tx: TransactionClient, itemId: string): Promise<boolean> {
  const slot = await tx.freeProductSlot.findUnique({ where: { listItemId: itemId } });
  if (!slot || slot.consumedAt) return false;
  await lockEntitlementById(tx, slot.entitlementId);
  const released = await tx.freeProductSlot.updateMany({
    where: { id: slot.id, consumedAt: null, listItemId: itemId },
    data: { listItemId: null, releasedAt: new Date() },
  });
  if (released.count > 0) {
    await tx.listItem.update({
      where: { id: itemId },
      data: { feeRateBps: PLATFORM_FEE_BPS.STANDARD },
    });
  }
  return released.count > 0;
}

/** Marks the item's slot as permanently consumed. Idempotent. */
export async function consumeSlot(
  tx: TransactionClient,
  itemId: string,
  at = new Date(),
): Promise<boolean> {
  const result = await tx.freeProductSlot.updateMany({
    where: { listItemId: itemId, consumedAt: null },
    data: { consumedAt: at },
  });
  return result.count > 0;
}

async function lockEntitlementById(tx: TransactionClient, entitlementId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "FreeTierEntitlement" WHERE "id" = ${entitlementId} FOR UPDATE`;
}

export type FeePreview = {
  /** Why the list gets (or not) free slots. */
  reason: "PROMOTIONAL_LIST" | "FIRST_PUBLICATION_PENDING" | "NOT_PROMOTIONAL";
  ratesByItemId: Map<string, number>;
  freeSlotsRemaining: number;
};

/**
 * Fee rate each active item has — or will have once the list is first published.
 * Used to show 0% / 1% before publishing.
 */
export async function previewFeeRates(
  db: PrismaClient | TransactionClient,
  params: { ownerId: string; listId: string },
): Promise<FeePreview> {
  const [entitlement, items] = await Promise.all([
    db.freeTierEntitlement.findUnique({
      where: { userId: params.ownerId },
      include: { slots: { select: { listItemId: true, consumedAt: true } } },
    }),
    db.listItem.findMany({
      where: { listId: params.listId, archivedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, feeRateBps: true },
    }),
  ]);

  const ratesByItemId = new Map<string, number>();
  if (!entitlement) {
    items.forEach((item, index) =>
      ratesByItemId.set(
        item.id,
        index < FREE_SLOT_COUNT ? PLATFORM_FEE_BPS.FREE : PLATFORM_FEE_BPS.STANDARD,
      ),
    );
    return {
      reason: "FIRST_PUBLICATION_PENDING",
      ratesByItemId,
      freeSlotsRemaining: Math.max(0, FREE_SLOT_COUNT - items.length),
    };
  }
  if (entitlement.firstPublishedListId !== params.listId) {
    items.forEach((item) => ratesByItemId.set(item.id, PLATFORM_FEE_BPS.STANDARD));
    return { reason: "NOT_PROMOTIONAL", ratesByItemId, freeSlotsRemaining: 0 };
  }
  items.forEach((item) => ratesByItemId.set(item.id, item.feeRateBps));
  const free = entitlement.slots.filter(
    (slot) => slot.listItemId === null && slot.consumedAt === null,
  );
  return { reason: "PROMOTIONAL_LIST", ratesByItemId, freeSlotsRemaining: free.length };
}
