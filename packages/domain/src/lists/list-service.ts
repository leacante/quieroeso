import { withSerializableRetry, type PrismaClient, type TransactionClient } from "@quieroeso/db";
import { generateSecretToken, sha256Hex } from "@quieroeso/integrations/crypto";
import { DomainError, notFound } from "../errors";
import { assignAvailableFreeSlots, ensureEntitlement } from "../fees/fee-policy";
import { writeAuditEvent } from "../security/audit-log";
import { generateListSlug } from "./slug";
import {
  shareTokenContext,
  type CreateListInput,
  type ListDeps,
  type PublishListInput,
  type UpdateListPatch,
} from "./types";

const LIST_NOT_FOUND = "No encontramos esa lista.";

type OwnedListRef = { listId: string; ownerId: string };

/** Loads a non-archived list owned by `ownerId`. Other owners get the same 404. */
async function findOwnedList(
  db: PrismaClient | TransactionClient,
  { listId, ownerId }: OwnedListRef,
) {
  const list = await db.wishList.findFirst({ where: { id: listId, ownerId, archivedAt: null } });
  if (!list) throw notFound(LIST_NOT_FOUND);
  return list;
}

export async function createList(db: PrismaClient, ownerId: string, input: CreateListInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateListSlug(input.title);
    const clash = await db.wishList.findUnique({ where: { slug }, select: { id: true } });
    if (clash) continue;
    return db.wishList.create({
      data: { ownerId, title: input.title, description: input.description || null, slug },
    });
  }
  throw new DomainError("CONFLICT", "No pudimos crear la lista. Probá de nuevo.");
}

export async function listOwnedLists(db: PrismaClient, ownerId: string) {
  const lists = await db.wishList.findMany({
    where: { ownerId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { items: { where: { archivedAt: null } } } },
      promotionEntitlement: { select: { id: true } },
    },
  });
  return lists.map(({ _count, promotionEntitlement, ...list }) => ({
    ...list,
    itemCount: _count.items,
    isPromotional: promotionEntitlement !== null,
  }));
}

export async function getOwnedList(db: PrismaClient, ref: OwnedListRef) {
  const list = await db.wishList.findFirst({
    where: { id: ref.listId, ownerId: ref.ownerId, archivedAt: null },
    include: {
      items: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        include: { freeSlot: { select: { slotNumber: true, consumedAt: true } } },
      },
      promotionEntitlement: { select: { id: true } },
    },
  });
  if (!list) throw notFound(LIST_NOT_FOUND);
  const { promotionEntitlement, ...rest } = list;
  return { ...rest, isPromotional: promotionEntitlement !== null };
}

export async function updateList(db: PrismaClient, ref: OwnedListRef, patch: UpdateListPatch) {
  return db.$transaction(async (tx) => {
    const list = await findOwnedList(tx, ref);

    if (patch.fundingMode === "PER_ITEM" && list.fundingMode !== "PER_ITEM") {
      const connection = await tx.mercadoPagoConnection.findUnique({
        where: { userId: ref.ownerId },
        select: { status: true },
      });
      if (connection?.status !== "ACTIVE") {
        throw new DomainError(
          "MERCADOPAGO_NOT_CONNECTED",
          "Conectá tu cuenta de Mercado Pago para recibir aportes.",
        );
      }
    }

    const updated = await tx.wishList.update({
      where: { id: list.id },
      data: {
        title: patch.title,
        description: patch.description === undefined ? undefined : patch.description || null,
        fundingMode: patch.fundingMode,
        // Going back to PRIVATE keeps publishedAt and never touches the promotion.
        visibility: patch.visibility,
      },
    });

    if (patch.fundingMode && patch.fundingMode !== list.fundingMode) {
      await writeAuditEvent(tx, {
        actorUserId: ref.ownerId,
        action: "list.funding_mode_changed",
        targetType: "list",
        targetId: list.id,
        metadata: { from: list.fundingMode, to: patch.fundingMode },
      });
    }
    if (patch.visibility === "PRIVATE" && list.visibility !== "PRIVATE") {
      await writeAuditEvent(tx, {
        actorUserId: ref.ownerId,
        action: "list.made_private",
        targetType: "list",
        targetId: list.id,
        metadata: { from: list.visibility },
      });
    }
    return updated;
  });
}

export type PublishResult = {
  list: Awaited<ReturnType<typeof findOwnedList>>;
  /** Plain share token, only for UNLISTED lists. */
  shareToken: string | null;
  promotion: { isPromotional: boolean; freeSlotsAssigned: number };
};

/**
 * Publishes a list as PUBLIC or UNLISTED. The first successful publication of any
 * of the owner's lists irreversibly receives the free-tier entitlement, and its
 * first eight active items (by position) get 0% slots.
 *
 * Runs in a SERIALIZABLE transaction with bounded retries; concurrent first
 * publications of two lists resolve to exactly one entitlement.
 */
export async function publishList(deps: ListDeps, input: PublishListInput): Promise<PublishResult> {
  return withSerializableRetry(
    deps.db,
    async (tx) => {
      const list = await findOwnedList(tx, input);

      let shareToken: string | null = null;
      let tokenData: { shareTokenHash: string; shareTokenEncrypted: string } | undefined;
      if (list.shareTokenEncrypted) {
        shareToken = deps.vault.decrypt(list.shareTokenEncrypted, shareTokenContext(list.id));
      } else if (input.visibility === "UNLISTED") {
        shareToken = generateSecretToken(32);
        tokenData = {
          shareTokenHash: sha256Hex(shareToken),
          shareTokenEncrypted: deps.vault.encrypt(shareToken, shareTokenContext(list.id)),
        };
      }

      const published = await tx.wishList.update({
        where: { id: list.id },
        data: {
          visibility: input.visibility,
          publishedAt: list.publishedAt ?? new Date(),
          ...tokenData,
        },
      });

      const { entitlement, created } = await ensureEntitlement(tx, input.ownerId, list.id);
      let freeSlotsAssigned = 0;
      if (created) {
        const items = await tx.listItem.findMany({
          where: { listId: list.id, archivedAt: null },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        const assigned = await assignAvailableFreeSlots(
          tx,
          entitlement.id,
          items.map((item) => item.id),
        );
        freeSlotsAssigned = assigned.length;
        await writeAuditEvent(tx, {
          actorUserId: input.ownerId,
          action: "free_tier.assigned",
          targetType: "list",
          targetId: list.id,
          metadata: { freeSlotsAssigned },
        });
      }

      await writeAuditEvent(tx, {
        actorUserId: input.ownerId,
        action: "list.published",
        targetType: "list",
        targetId: list.id,
        metadata: { from: list.visibility, to: input.visibility },
      });

      return {
        list: published,
        shareToken: input.visibility === "UNLISTED" ? shareToken : null,
        promotion: {
          isPromotional: entitlement.firstPublishedListId === list.id,
          freeSlotsAssigned,
        },
      };
    },
    { retryOnUniqueViolation: true },
  );
}

/** Returns the current share link token so the owner can copy it again. */
export async function getShareToken(deps: ListDeps, ref: OwnedListRef): Promise<string | null> {
  const list = await findOwnedList(deps.db, ref);
  if (list.visibility !== "UNLISTED" || !list.shareTokenEncrypted) return null;
  return deps.vault.decrypt(list.shareTokenEncrypted, shareTokenContext(list.id));
}

/** Invalidates the current unlisted link and issues a new one. */
export async function rotateShareToken(deps: ListDeps, ref: OwnedListRef): Promise<string> {
  return deps.db.$transaction(async (tx) => {
    const list = await findOwnedList(tx, ref);
    if (list.visibility !== "UNLISTED") {
      throw new DomainError("INVALID_STATE", "Sólo las listas no listadas tienen enlace secreto.");
    }
    const token = generateSecretToken(32);
    await tx.wishList.update({
      where: { id: list.id },
      data: {
        shareTokenHash: sha256Hex(token),
        shareTokenEncrypted: deps.vault.encrypt(token, shareTokenContext(list.id)),
      },
    });
    await writeAuditEvent(tx, {
      actorUserId: ref.ownerId,
      action: "list.share_token_rotated",
      targetType: "list",
      targetId: list.id,
    });
    return token;
  });
}

/**
 * Soft-deletes a list. Lists are never hard-deleted: they may hold financial
 * history or be the owner's promotional list.
 */
export async function archiveList(db: PrismaClient, ref: OwnedListRef): Promise<void> {
  await db.$transaction(async (tx) => {
    const list = await findOwnedList(tx, ref);
    await tx.wishList.update({
      where: { id: list.id },
      data: { archivedAt: new Date(), visibility: "PRIVATE" },
    });
    await writeAuditEvent(tx, {
      actorUserId: ref.ownerId,
      action: "list.archived",
      targetType: "list",
      targetId: list.id,
    });
  });
}
