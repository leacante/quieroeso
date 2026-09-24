import { describe, expect, it } from "vitest";
import { insertItem, removeItem, reorderItems } from "../lists/item-service";
import { publishList } from "../lists/list-service";
import {
  createContributionRow,
  createListWithItems,
  createTestUser,
  itemData,
  useTestDatabase,
} from "../testing/fixtures";
import { consumeSlot, previewFeeRates } from "./fee-policy";

const ctx = useTestDatabase();

async function rates(listId: string): Promise<number[]> {
  const items = await ctx.db.listItem.findMany({
    where: { listId, archivedAt: null },
    orderBy: { position: "asc" },
  });
  return items.map((item) => item.feeRateBps);
}

async function publish(listId: string, ownerId: string) {
  return publishList(ctx.deps, { listId, ownerId, visibility: "PUBLIC" });
}

describe("first published list free slots", () => {
  it.each([
    [0, 0],
    [5, 5],
    [8, 8],
    [12, 8],
  ])("publishing with %i items gives %i free items", async (count, free) => {
    const owner = await createTestUser(ctx.db);
    const { list } = await createListWithItems(ctx.db, owner.id, count);
    const result = await publish(list.id, owner.id);

    expect(result.promotion).toEqual({ isPromotional: true, freeSlotsAssigned: free });
    const listRates = await rates(list.id);
    expect(listRates.filter((rate) => rate === 0)).toHaveLength(free);
    expect(listRates.slice(0, free).every((rate) => rate === 0)).toBe(true);
    expect(listRates.slice(free).every((rate) => rate === 100)).toBe(true);
  });

  it("items added after publication consume the remaining slots", async () => {
    const owner = await createTestUser(ctx.db);
    const { list } = await createListWithItems(ctx.db, owner.id, 5);
    await publish(list.id, owner.id);

    const added = [];
    for (let index = 0; index < 4; index++) {
      added.push(await insertItem(ctx.db, { listId: list.id, ownerId: owner.id }, itemData()));
    }
    expect(added.map((item) => item.feeRateBps)).toEqual([0, 0, 0, 100]);
    expect((await rates(list.id)).filter((rate) => rate === 0)).toHaveLength(8);
  });

  it("items of later lists pay 1% even with unused slots in the first list", async () => {
    const owner = await createTestUser(ctx.db);
    const first = await createListWithItems(ctx.db, owner.id, 2, "Primera");
    await publish(first.list.id, owner.id);

    const second = await createListWithItems(ctx.db, owner.id, 1, "Segunda");
    const result = await publish(second.list.id, owner.id);
    expect(result.promotion.isPromotional).toBe(false);
    expect(await rates(second.list.id)).toEqual([100]);

    const extra = await insertItem(
      ctx.db,
      { listId: second.list.id, ownerId: owner.id },
      itemData(),
    );
    expect(extra.feeRateBps).toBe(100);
  });

  it("reordering does not move slots", async () => {
    const owner = await createTestUser(ctx.db);
    const { list, items } = await createListWithItems(ctx.db, owner.id, 10);
    await publish(list.id, owner.id);

    const reversed = [...items].reverse().map((item) => item.id);
    await reorderItems(ctx.db, { listId: list.id, ownerId: owner.id }, reversed);

    const byId = new Map(
      (await ctx.db.listItem.findMany({ where: { listId: list.id } })).map((item) => [
        item.id,
        item,
      ]),
    );
    items.forEach((item, index) => {
      expect(byId.get(item.id)?.feeRateBps).toBe(index < 8 ? 0 : 100);
      expect(byId.get(item.id)?.position).toBe(9 - index);
    });
  });
});

describe("slot release and consumption", () => {
  it("removing an item without contributions releases its slot for the next item", async () => {
    const owner = await createTestUser(ctx.db);
    const { list, items } = await createListWithItems(ctx.db, owner.id, 8);
    await publish(list.id, owner.id);
    const ref = { listId: list.id, ownerId: owner.id };

    expect(await removeItem(ctx.db, { ...ref, itemId: items[0]!.id })).toBe("DELETED");
    expect(await ctx.db.freeProductSlot.count({ where: { listItemId: null } })).toBe(1);

    const replacement = await insertItem(ctx.db, ref, itemData());
    expect(replacement.feeRateBps).toBe(0);
  });

  it("an item with a pending contribution is archived and its slot released", async () => {
    const owner = await createTestUser(ctx.db);
    const { list, items } = await createListWithItems(ctx.db, owner.id, 8);
    await publish(list.id, owner.id);
    await createContributionRow(ctx.db, items[0]!.id, "CREATED");

    const outcome = await removeItem(ctx.db, {
      listId: list.id,
      ownerId: owner.id,
      itemId: items[0]!.id,
    });
    expect(outcome).toBe("ARCHIVED");
    expect(await ctx.db.freeProductSlot.count({ where: { listItemId: null } })).toBe(1);
  });

  it("removing an item with an approved contribution never frees the slot", async () => {
    const owner = await createTestUser(ctx.db);
    const { list, items } = await createListWithItems(ctx.db, owner.id, 8);
    await publish(list.id, owner.id);
    const ref = { listId: list.id, ownerId: owner.id };
    const funded = items[0]!;

    await createContributionRow(ctx.db, funded.id, "APPROVED");
    await ctx.db.$transaction((tx) => consumeSlot(tx, funded.id));

    expect(await removeItem(ctx.db, { ...ref, itemId: funded.id })).toBe("ARCHIVED");
    const slot = await ctx.db.freeProductSlot.findUniqueOrThrow({
      where: { listItemId: funded.id },
    });
    expect(slot.consumedAt).not.toBeNull();

    // Deleting and recreating products must not regenerate consumed slots.
    const recreated = await insertItem(ctx.db, ref, itemData());
    expect(recreated.feeRateBps).toBe(100);
    expect(
      await ctx.db.freeProductSlot.count({ where: { consumedAt: null, listItemId: null } }),
    ).toBe(0);
  });

  it("consuming a slot is idempotent", async () => {
    const owner = await createTestUser(ctx.db);
    const { list, items } = await createListWithItems(ctx.db, owner.id, 1);
    await publish(list.id, owner.id);
    const itemId = items[0]!.id;
    expect(await ctx.db.$transaction((tx) => consumeSlot(tx, itemId))).toBe(true);
    expect(await ctx.db.$transaction((tx) => consumeSlot(tx, itemId))).toBe(false);
  });
});

describe("fee preview", () => {
  it("previews 0% for the first eight items before the first publication", async () => {
    const owner = await createTestUser(ctx.db);
    const { list, items } = await createListWithItems(ctx.db, owner.id, 9);
    const preview = await previewFeeRates(ctx.db, { ownerId: owner.id, listId: list.id });
    expect(preview.reason).toBe("FIRST_PUBLICATION_PENDING");
    expect(items.map((item) => preview.ratesByItemId.get(item.id))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 100,
    ]);
  });

  it("previews 1% for lists that are not promotional", async () => {
    const owner = await createTestUser(ctx.db);
    const first = await createListWithItems(ctx.db, owner.id, 1, "Primera");
    await publish(first.list.id, owner.id);
    const second = await createListWithItems(ctx.db, owner.id, 2, "Segunda");
    const preview = await previewFeeRates(ctx.db, { ownerId: owner.id, listId: second.list.id });
    expect(preview.reason).toBe("NOT_PROMOTIONAL");
    expect([...preview.ratesByItemId.values()]).toEqual([100, 100]);
  });
});
