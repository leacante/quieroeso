import { randomUUID } from "node:crypto";
import { MercadoPagoApiError, type PreferenceInput } from "@quieroeso/integrations/mercadopago";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../errors";
import { insertItem } from "../lists/item-service";
import { createList, publishList, updateList } from "../lists/list-service";
import { createTestUser, itemData, useTestDatabase } from "../testing/fixtures";
import {
  createContribution,
  type ContributionDeps,
  type CreateContributionInput,
} from "./create-contribution";

const ctx = useTestDatabase();

function deps(overrides: Partial<ContributionDeps> = {}): ContributionDeps {
  return {
    db: ctx.db,
    getOwnerAccessToken: vi.fn(async () => ({ accessToken: "APP_USR-owner", mercadoPagoUserId: "1001" })),
    createPreference: vi.fn(async (_token: string, input: PreferenceInput) => ({
      id: `pref-${input.externalReference}`,
      initPoint: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-${input.externalReference}`,
    })),
    config: {
      minContributionMinor: 100_000n,
      appUrl: "https://quieroeso.app",
      notificationUrl: "https://quieroeso.app/api/webhooks/mercadopago",
      checkoutHosts: ["www.mercadopago.com.ar"],
    },
    ...overrides,
  };
}

/** A published per-item list with one item (target $1.500) plus a second, non-promotional list. */
async function setup(options: { visibility?: "PUBLIC" | "UNLISTED"; perItem?: boolean } = {}) {
  const owner = await createTestUser(ctx.db);
  await ctx.db.mercadoPagoConnection.create({
    data: {
      userId: owner.id,
      mercadoPagoUserId: `mp-${owner.id}`,
      encryptedAccessToken: "x",
      encryptedRefreshToken: "x",
      tokenExpiresAt: new Date(Date.now() + 86_400_000 * 30),
      keyVersion: 1,
    },
  });
  const list = await createList(ctx.db, owner.id, { title: "Casamiento" });
  const ref = { listId: list.id, ownerId: owner.id };
  const item = await insertItem(ctx.db, ref, itemData({ priceMinor: 150_000n }));
  const published = await publishList(ctx.deps, { ...ref, visibility: options.visibility ?? "PUBLIC" });
  if (options.perItem !== false) await updateList(ctx.db, ref, { fundingMode: "PER_ITEM" });
  const access =
    options.visibility === "UNLISTED"
      ? ({ type: "shared", token: published.shareToken! } as const)
      : ({ type: "public", slug: list.slug } as const);
  return { owner, list, ref, item, access };
}

function input(listItemId: string, access: CreateContributionInput["access"], amountMinor = 100_000n) {
  return { listItemId, amountMinor, access, acceptTerms: true as const, contributorName: "Tía Marta" };
}

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).code;
}

describe("createContribution", () => {
  it("creates the contribution first and a single-item preference keyed by its id", async () => {
    const { item, access } = await setup();
    const d = deps();
    const result = await createContribution(d, input(item.id, access), randomUUID());

    const row = await ctx.db.contribution.findUniqueOrThrow({ where: { id: result.contributionId } });
    expect(row).toMatchObject({
      status: "CHECKOUT_CREATED",
      amountMinor: 100_000n,
      platformFeeRateBps: 0,
      platformFeeAmountMinor: 0n,
      mpPreferenceId: `pref-${row.id}`,
    });
    const [token, preference, key] = vi.mocked(d.createPreference).mock.calls[0]!;
    expect(token).toBe("APP_USR-owner");
    expect(key).toBe(row.id);
    expect(preference.externalReference).toBe(row.id);
    expect(preference).not.toHaveProperty("marketplaceFee");
    expect(preference.item.unitPrice).toBe(1000);
    expect(result.checkoutUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
  });

  it("charges 1% for non-promotional items", async () => {
    const { owner, access: _ } = await setup();
    const second = await createList(ctx.db, owner.id, { title: "Otra" });
    const ref = { listId: second.id, ownerId: owner.id };
    const item = await insertItem(ctx.db, ref, itemData({ priceMinor: 1_000_000n }));
    await publishList(ctx.deps, { ...ref, visibility: "PUBLIC" });
    await updateList(ctx.db, ref, { fundingMode: "PER_ITEM" });

    const d = deps();
    const result = await createContribution(
      d,
      input(item.id, { type: "public", slug: second.slug }, 123_456n),
      randomUUID(),
    );
    const row = await ctx.db.contribution.findUniqueOrThrow({ where: { id: result.contributionId } });
    expect(row).toMatchObject({ platformFeeRateBps: 100, platformFeeAmountMinor: 1_235n });
    expect(vi.mocked(d.createPreference).mock.calls[0]![1].marketplaceFee).toBe(12.35);
  });

  it("is idempotent for the same Idempotency-Key", async () => {
    const { item, access } = await setup();
    const d = deps();
    const key = randomUUID();
    const first = await createContribution(d, input(item.id, access), key);
    const second = await createContribution(d, input(item.id, access), key);
    expect(second.contributionId).toBe(first.contributionId);
    expect(await ctx.db.contribution.count()).toBe(1);
    // Same X-Idempotency-Key both times, so Mercado Pago returns the same preference.
    expect(vi.mocked(d.createPreference).mock.calls.map((call) => call[2])).toEqual([
      first.contributionId,
      first.contributionId,
    ]);
    expect(await codeOf(createContribution(d, input(item.id, access, 120_000n), key))).toBe("CONFLICT");
  });

  it("enforces the minimum and the remaining balance, including recent reservations", async () => {
    const { item, access } = await setup();
    const d = deps();
    expect(await codeOf(createContribution(d, input(item.id, access, 99_999n), randomUUID()))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await codeOf(createContribution(d, input(item.id, access, 150_001n), randomUUID()))).toBe(
      "VALIDATION_FAILED",
    );
    // $1.000 reserved leaves $500: below the minimum, but completing the target is allowed.
    await createContribution(d, input(item.id, access, 100_000n), randomUUID());
    expect(await codeOf(createContribution(d, input(item.id, access, 100_000n), randomUUID()))).toBe(
      "VALIDATION_FAILED",
    );
    await createContribution(d, input(item.id, access, 50_000n), randomUUID());
    expect(await codeOf(createContribution(d, input(item.id, access, 50_000n), randomUUID()))).toBe(
      "INVALID_STATE",
    );
  });

  it("releases reservations older than 30 minutes", async () => {
    const { item, access } = await setup();
    await createContribution(deps(), input(item.id, access, 150_000n), randomUUID());
    const later = deps({ now: () => new Date(Date.now() + 31 * 60_000) });
    await expect(createContribution(later, input(item.id, access, 150_000n), randomUUID())).resolves.toBeTruthy();
  });

  it("rejects lists that are not shared, not per-item, archived items or no Mercado Pago", async () => {
    const privateCase = await setup();
    await updateList(ctx.db, privateCase.ref, { visibility: "PRIVATE" });
    expect(await codeOf(createContribution(deps(), input(privateCase.item.id, privateCase.access), randomUUID()))).toBe(
      "NOT_FOUND",
    );

    const wishlist = await setup({ perItem: false });
    expect(await codeOf(createContribution(deps(), input(wishlist.item.id, wishlist.access), randomUUID()))).toBe(
      "INVALID_STATE",
    );

    const archived = await setup();
    await ctx.db.listItem.update({ where: { id: archived.item.id }, data: { archivedAt: new Date() } });
    expect(await codeOf(createContribution(deps(), input(archived.item.id, archived.access), randomUUID()))).toBe(
      "INVALID_STATE",
    );

    const disconnected = await setup();
    const noMp = deps({
      getOwnerAccessToken: vi.fn(async () => {
        throw new DomainError("MERCADOPAGO_NOT_CONNECTED", "no");
      }),
    });
    expect(await codeOf(createContribution(noMp, input(disconnected.item.id, disconnected.access), randomUUID()))).toBe(
      "MERCADOPAGO_NOT_CONNECTED",
    );
  });

  it("requires the secret token for unlisted lists", async () => {
    const { item, list, access } = await setup({ visibility: "UNLISTED" });
    await expect(createContribution(deps(), input(item.id, access), randomUUID())).resolves.toBeTruthy();
    expect(
      await codeOf(createContribution(deps(), input(item.id, { type: "public", slug: list.slug }), randomUUID())),
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(createContribution(deps(), input(item.id, { type: "shared", token: "x".repeat(43) }), randomUUID())),
    ).toBe("NOT_FOUND");
  });

  it("cancels the contribution when Mercado Pago rejects the preference", async () => {
    const { item, access } = await setup();
    const failing = deps({
      createPreference: vi.fn(async () => {
        throw new MercadoPagoApiError("BAD_REQUEST", 400);
      }),
    });
    expect(await codeOf(createContribution(failing, input(item.id, access), randomUUID()))).toBe("UPSTREAM_UNAVAILABLE");
    expect(await ctx.db.contribution.findFirstOrThrow()).toMatchObject({ status: "CANCELLED" });
  });

  it("refuses checkout URLs outside the allowed hosts", async () => {
    const { item, access } = await setup();
    const evil = deps({ createPreference: vi.fn(async () => ({ id: "p", initPoint: "https://evil.example/pay" })) });
    expect(await codeOf(createContribution(evil, input(item.id, access), randomUUID()))).toBe("UPSTREAM_UNAVAILABLE");
  });
});
