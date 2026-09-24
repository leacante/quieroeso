import { sha256Hex } from "@quieroeso/integrations/crypto";
import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { createListWithItems, createTestUser, useTestDatabase } from "../testing/fixtures";
import {
  archiveList,
  createList,
  getOwnedList,
  getShareToken,
  listOwnedLists,
  publishList,
  rotateShareToken,
  updateList,
} from "./list-service";

const ctx = useTestDatabase();

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("list ownership", () => {
  it("hides lists from other users with a 404", async () => {
    const owner = await createTestUser(ctx.db);
    const intruder = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Cumple" });
    const ref = { listId: list.id, ownerId: intruder.id };

    await expectDomainError(getOwnedList(ctx.db, ref), "NOT_FOUND");
    await expectDomainError(updateList(ctx.db, ref, { title: "Hackeada" }), "NOT_FOUND");
    await expectDomainError(publishList(ctx.deps, { ...ref, visibility: "PUBLIC" }), "NOT_FOUND");
    await expectDomainError(archiveList(ctx.db, ref), "NOT_FOUND");
    expect(await listOwnedLists(ctx.db, intruder.id)).toEqual([]);
  });

  it("keeps the slug stable when the title changes", async () => {
    const owner = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Cumple de Ana" });
    const updated = await updateList(
      ctx.db,
      { listId: list.id, ownerId: owner.id },
      { title: "Casamiento" },
    );
    expect(updated.slug).toBe(list.slug);
    expect(updated.slug).toMatch(/^cumple-de-ana-/);
  });
});

describe("visibility transitions", () => {
  it("creates an unlisted token stored only as hash and ciphertext", async () => {
    const owner = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Baby shower" });
    const ref = { listId: list.id, ownerId: owner.id };

    const result = await publishList(ctx.deps, { ...ref, visibility: "UNLISTED" });
    expect(result.shareToken).toMatch(/^[\w-]{43}$/);

    const row = await ctx.db.wishList.findUniqueOrThrow({ where: { id: list.id } });
    expect(row.visibility).toBe("UNLISTED");
    expect(row.shareTokenHash).toBe(sha256Hex(result.shareToken!));
    expect(row.shareTokenEncrypted).not.toContain(result.shareToken!);
    expect(await getShareToken(ctx.deps, ref)).toBe(result.shareToken);
  });

  it("does not create a token for public lists", async () => {
    const owner = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Pública" });
    const result = await publishList(ctx.deps, {
      listId: list.id,
      ownerId: owner.id,
      visibility: "PUBLIC",
    });
    expect(result.shareToken).toBeNull();
    const row = await ctx.db.wishList.findUniqueOrThrow({ where: { id: list.id } });
    expect(row.shareTokenHash).toBeNull();
  });

  it("going back to PRIVATE keeps publishedAt and the promotion", async () => {
    const owner = await createTestUser(ctx.db);
    const { list } = await createListWithItems(ctx.db, owner.id, 2);
    const ref = { listId: list.id, ownerId: owner.id };

    const first = await publishList(ctx.deps, { ...ref, visibility: "UNLISTED" });
    await updateList(ctx.db, ref, { visibility: "PRIVATE" });

    const row = await ctx.db.wishList.findUniqueOrThrow({ where: { id: list.id } });
    expect(row.visibility).toBe("PRIVATE");
    expect(row.publishedAt).toEqual(first.list.publishedAt);
    const entitlement = await ctx.db.freeTierEntitlement.findUniqueOrThrow({
      where: { userId: owner.id },
    });
    expect(entitlement.firstPublishedListId).toBe(list.id);

    const again = await publishList(ctx.deps, { ...ref, visibility: "UNLISTED" });
    expect(again.shareToken).toBe(first.shareToken);
    expect(again.list.publishedAt).toEqual(first.list.publishedAt);
  });

  it("rotating the share token invalidates the previous one", async () => {
    const owner = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Secreta" });
    const ref = { listId: list.id, ownerId: owner.id };
    const { shareToken } = await publishList(ctx.deps, { ...ref, visibility: "UNLISTED" });

    const rotated = await rotateShareToken(ctx.deps, ref);
    expect(rotated).not.toBe(shareToken);
    const row = await ctx.db.wishList.findUniqueOrThrow({ where: { id: list.id } });
    expect(row.shareTokenHash).toBe(sha256Hex(rotated));
  });

  it("requires an active Mercado Pago connection for per-item contributions", async () => {
    const owner = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Aportes" });
    await expectDomainError(
      updateList(ctx.db, { listId: list.id, ownerId: owner.id }, { fundingMode: "PER_ITEM" }),
      "MERCADOPAGO_NOT_CONNECTED",
    );
  });

  it("archives lists instead of deleting them", async () => {
    const owner = await createTestUser(ctx.db);
    const list = await createList(ctx.db, owner.id, { title: "Vieja" });
    await publishList(ctx.deps, { listId: list.id, ownerId: owner.id, visibility: "PUBLIC" });
    await archiveList(ctx.db, { listId: list.id, ownerId: owner.id });
    const row = await ctx.db.wishList.findUniqueOrThrow({ where: { id: list.id } });
    expect(row.archivedAt).not.toBeNull();
    expect(row.visibility).toBe("PRIVATE");
  });
});

describe("atomic first publication", () => {
  it("assigns the promotion to exactly one of two concurrently published lists", async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await createTestUser(ctx.db);
      const a = await createListWithItems(ctx.db, owner.id, 3, `A${round}`);
      const b = await createListWithItems(ctx.db, owner.id, 3, `B${round}`);

      const results = await Promise.all([
        publishList(ctx.deps, { listId: a.list.id, ownerId: owner.id, visibility: "PUBLIC" }),
        publishList(ctx.deps, { listId: b.list.id, ownerId: owner.id, visibility: "UNLISTED" }),
      ]);

      const entitlements = await ctx.db.freeTierEntitlement.findMany({
        where: { userId: owner.id },
      });
      expect(entitlements).toHaveLength(1);
      const winner = entitlements[0]!.firstPublishedListId;
      expect([a.list.id, b.list.id]).toContain(winner);
      expect(results.filter((result) => result.promotion.isPromotional)).toHaveLength(1);

      const loser = winner === a.list.id ? b.list.id : a.list.id;
      const freeItems = await ctx.db.listItem.findMany({
        where: { feeRateBps: 0, list: { ownerId: owner.id } },
      });
      expect(freeItems.every((item) => item.listId === winner)).toBe(true);
      expect(await ctx.db.listItem.count({ where: { listId: loser, feeRateBps: 0 } })).toBe(0);
      expect(await ctx.db.freeProductSlot.count({ where: { listItemId: { not: null } } })).toBe(
        3 * (round + 1),
      );
    }
  });
});
