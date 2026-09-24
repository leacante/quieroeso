import type { Prisma, PrismaClient, TransactionClient } from "@quieroeso/db";
import { z } from "zod";
import { DomainError, notFound } from "../errors";
import { assignSlotToNewItem, releaseUnusedSlot } from "../fees/fee-policy";

export const MAX_ITEMS_PER_LIST = 100;
const MAX_AMOUNT_MINOR = 1_000_000_000_00n; // $1.000.000.000

const httpsUrl = z
  .url({ protocol: /^https$/, message: "Usá un enlace que empiece con https://" })
  .max(2048);

export const minorAmountSchema = z
  .union([z.string().regex(/^\d+$/, "Ingresá un monto válido."), z.number().int().nonnegative()])
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n && value <= MAX_AMOUNT_MINOR, "Ingresá un monto válido.");

export const manualItemSchema = z.object({
  title: z.string().trim().min(1, "Poné un nombre.").max(200, "Usá como máximo 200 caracteres."),
  notes: z.string().trim().max(500, "Usá como máximo 500 caracteres.").optional(),
  sourceUrl: httpsUrl.optional(),
  imageUrl: httpsUrl.optional(),
  priceMinor: minorAmountSchema.optional(),
  targetAmountMinor: minorAmountSchema.optional(),
});
export type ManualItemInput = z.infer<typeof manualItemSchema>;

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1, "Poné un nombre.").max(200).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    imageUrl: httpsUrl.nullable().optional(),
    targetAmountMinor: minorAmountSchema.nullable().optional(),
    /** Restores title and image from the last source snapshot. */
    resetToSource: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");
export type UpdateItemPatch = z.infer<typeof updateItemSchema>;

export const reorderItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(MAX_ITEMS_PER_LIST),
});

export type NewItemData = {
  sourceType: "MERCADOLIBRE" | "MANUAL";
  sourceUrl: string | null;
  externalId: string | null;
  externalKind: string | null;
  title: string;
  notes: string | null;
  imageUrl: string | null;
  sourceSnapshot: Prisma.InputJsonValue | null;
  priceMinor: bigint | null;
  targetAmountMinor: bigint | null;
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  lastSyncedAt: Date | null;
};

type ListRef = { listId: string; ownerId: string };

/** Locks the owned list row; serializes position allocation for concurrent inserts. */
async function lockOwnedList(tx: TransactionClient, ref: ListRef) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WishList"
    WHERE "id" = ${ref.listId} AND "ownerId" = ${ref.ownerId} AND "archivedAt" IS NULL
    FOR UPDATE`;
  if (rows.length === 0) throw notFound("No encontramos esa lista.");
}

/**
 * Inserts an item at the end of the list and, for the owner's promotional list,
 * gives it a free slot if one is left.
 */
export async function insertItem(db: PrismaClient, ref: ListRef, data: NewItemData) {
  return db.$transaction(async (tx) => {
    await lockOwnedList(tx, ref);
    const [activeCount, last] = await Promise.all([
      tx.listItem.count({ where: { listId: ref.listId, archivedAt: null } }),
      tx.listItem.findFirst({
        where: { listId: ref.listId },
        orderBy: { position: "desc" },
        select: { position: true },
      }),
    ]);
    if (activeCount >= MAX_ITEMS_PER_LIST) {
      throw new DomainError(
        "INVALID_STATE",
        `Una lista puede tener hasta ${MAX_ITEMS_PER_LIST} productos.`,
      );
    }
    const item = await tx.listItem.create({
      data: {
        ...data,
        sourceSnapshot: data.sourceSnapshot ?? undefined,
        targetAmountMinor: data.targetAmountMinor ?? data.priceMinor,
        listId: ref.listId,
        position: (last?.position ?? -1) + 1,
        feeRateBps: 100,
      },
    });
    const feeRateBps = await assignSlotToNewItem(tx, { ...ref, itemId: item.id });
    await tx.wishList.update({ where: { id: ref.listId }, data: { updatedAt: new Date() } });
    return { ...item, feeRateBps };
  });
}

export async function addManualItem(db: PrismaClient, ref: ListRef, input: ManualItemInput) {
  return insertItem(db, ref, {
    sourceType: "MANUAL",
    sourceUrl: input.sourceUrl ?? null,
    externalId: null,
    externalKind: null,
    title: input.title,
    notes: input.notes || null,
    imageUrl: input.imageUrl ?? null,
    sourceSnapshot: null,
    priceMinor: input.priceMinor ?? null,
    targetAmountMinor: input.targetAmountMinor ?? null,
    availability: "UNKNOWN",
    lastSyncedAt: null,
  });
}

async function findOwnedItem(
  tx: TransactionClient | PrismaClient,
  ref: ListRef & { itemId: string },
) {
  const item = await tx.listItem.findFirst({
    where: {
      id: ref.itemId,
      listId: ref.listId,
      archivedAt: null,
      list: { ownerId: ref.ownerId, archivedAt: null },
    },
  });
  if (!item) throw notFound("No encontramos ese producto.");
  return item;
}

type SnapshotPresentation = { title?: unknown; imageUrl?: unknown };

export async function updateItem(
  db: PrismaClient,
  ref: ListRef & { itemId: string },
  patch: UpdateItemPatch,
) {
  const item = await findOwnedItem(db, ref);
  const snapshot = (item.sourceSnapshot ?? {}) as SnapshotPresentation;
  const reset = patch.resetToSource === true;
  return db.listItem.update({
    where: { id: item.id },
    data: {
      title: reset && typeof snapshot.title === "string" ? snapshot.title : patch.title,
      imageUrl:
        reset && (typeof snapshot.imageUrl === "string" || snapshot.imageUrl === null)
          ? (snapshot.imageUrl as string | null)
          : patch.imageUrl,
      notes: patch.notes === undefined ? undefined : patch.notes || null,
      targetAmountMinor: patch.targetAmountMinor,
    },
  });
}

export type RemoveItemResult = "DELETED" | "ARCHIVED";

/**
 * Removes an item from a list.
 * - Never had contributions: hard delete, and its free slot is released.
 * - Had contributions but none approved: archived, and its free slot is released.
 * - Had an approved contribution: archived; its slot stays consumed forever.
 */
export async function removeItem(
  db: PrismaClient,
  ref: ListRef & { itemId: string },
): Promise<RemoveItemResult> {
  return db.$transaction(async (tx) => {
    await lockOwnedList(tx, ref);
    const item = await findOwnedItem(tx, ref);
    const [total, everApproved] = await Promise.all([
      tx.contribution.count({ where: { listItemId: item.id } }),
      tx.contribution.count({ where: { listItemId: item.id, approvedAt: { not: null } } }),
    ]);

    if (everApproved === 0) {
      await releaseUnusedSlot(tx, item.id);
    }
    if (total === 0) {
      await tx.listItem.delete({ where: { id: item.id } });
      return "DELETED";
    }
    await tx.listItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
    return "ARCHIVED";
  });
}

/**
 * Reorders active items. Positions change; free-slot assignments do not.
 * `itemIds` must list every active item exactly once.
 */
export async function reorderItems(db: PrismaClient, ref: ListRef, itemIds: string[]) {
  await db.$transaction(async (tx) => {
    await lockOwnedList(tx, ref);
    const items = await tx.listItem.findMany({
      where: { listId: ref.listId },
      orderBy: { position: "asc" },
      select: { id: true, archivedAt: true },
    });
    const active = items.filter((item) => item.archivedAt === null);
    const activeIds = new Set(active.map((item) => item.id));
    if (
      itemIds.length !== activeIds.size ||
      new Set(itemIds).size !== itemIds.length ||
      !itemIds.every((id) => activeIds.has(id))
    ) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "El nuevo orden no coincide con los productos de la lista.",
      );
    }
    const archived = items.filter((item) => item.archivedAt !== null).map((item) => item.id);
    const finalOrder = [...itemIds, ...archived];
    // Two phases avoid transient (listId, position) collisions.
    for (const [index, id] of finalOrder.entries()) {
      await tx.listItem.update({ where: { id }, data: { position: -(index + 1) } });
    }
    for (const [index, id] of finalOrder.entries()) {
      await tx.listItem.update({ where: { id }, data: { position: index } });
    }
  });
}
