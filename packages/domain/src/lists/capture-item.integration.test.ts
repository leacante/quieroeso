import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { createTestUser, useTestDatabase } from "../testing/fixtures";
import { addCapturedItem, canonicalCapturedUrl } from "./capture-item";
import { createList } from "./list-service";

const ctx = useTestDatabase();

const PAGE =
  "https://www.mercadolibre.com.ar/aplique-techo-barral/up/MLAU3914430684?pdp_filters=item_id%3AMLA3202924364#wid=MLA3202924364";

async function setup() {
  const owner = await createTestUser(ctx.db);
  const list = await createList(ctx.db, owner.id, { title: "Casa" });
  return { listId: list.id, ownerId: owner.id };
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe("canonicalCapturedUrl", () => {
  it("strips tracking and prefers the listing link", () => {
    expect(canonicalCapturedUrl(PAGE)).toBe("https://articulo.mercadolibre.com.ar/MLA-3202924364");
    expect(
      canonicalCapturedUrl("https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684?sid=x#y"),
    ).toBe("https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684");
  });

  it.each([
    "https://evil.com/up/MLAU1",
    "http://www.mercadolibre.com.ar/up/MLAU3914430684",
    "https://user:pw@www.mercadolibre.com.ar/x",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => canonicalCapturedUrl(url)).toThrow(DomainError);
  });
});

describe("addCapturedItem", () => {
  it("stores the captured product without an external id and uses the price as target", async () => {
    const ref = await setup();
    const item = await addCapturedItem(ctx.db, ref, {
      url: PAGE,
      title: "Aplique Techo Barral Slim Spot 5 Luces",
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_1-O.webp",
      priceMinor: 4_599_900n,
    });
    expect(item).toMatchObject({
      sourceType: "MERCADOLIBRE",
      sourceUrl: "https://articulo.mercadolibre.com.ar/MLA-3202924364",
      externalId: null,
      title: "Aplique Techo Barral Slim Spot 5 Luces",
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_1-O.webp",
      priceMinor: 4_599_900n,
      targetAmountMinor: 4_599_900n,
    });
    expect(item.sourceSnapshot).toMatchObject({ origin: "BROWSER_CAPTURE", priceMinor: "4599900" });
  });

  it("drops images that are not on Mercado Libre's CDN", async () => {
    const ref = await setup();
    const item = await addCapturedItem(ctx.db, ref, {
      url: PAGE,
      title: "Aplique",
      imageUrl: "https://tracker.example.com/pixel.gif",
    });
    expect(item.imageUrl).toBeNull();
  });

  it("refuses duplicates and lists of other owners", async () => {
    const ref = await setup();
    await addCapturedItem(ctx.db, ref, { url: PAGE, title: "Aplique" });
    expect(
      (await errorOf(addCapturedItem(ctx.db, ref, { url: PAGE, title: "Otra vez" }))).code,
    ).toBe("CONFLICT");

    const stranger = await createTestUser(ctx.db);
    const foreign = await errorOf(
      addCapturedItem(
        ctx.db,
        { listId: ref.listId, ownerId: stranger.id },
        { url: PAGE, title: "X" },
      ),
    );
    expect(foreign.code).toBe("NOT_FOUND");
  });
});
