import type { PublicListView } from "@quieroeso/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildItemListJsonLd, jsonLdScript, listDescription, toPublicListJson } from "./public-metadata";

const list: PublicListView = {
  id: "clist_internal_123",
  slug: "cumple-de-ana-abc123",
  title: "Cumple de Ana",
  description: null,
  visibility: "PUBLIC",
  fundingMode: "PER_ITEM",
  acceptsContributions: true,
  publishedAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-02T00:00:00Z"),
  items: [
    {
      id: "item_1",
      title: "Cafetera",
      notes: "La roja </script><script>alert(1)</script>",
      imageUrl: "https://http2.mlstatic.com/D_1-O.jpg",
      sourceUrl: "https://articulo.mercadolibre.com.ar/MLA-1",
      sourceType: "MERCADOLIBRE",
      priceMinor: 18_999_999n,
      targetAmountMinor: 18_999_999n,
      fundedMinor: 5_000_000n,
      availability: "AVAILABLE",
      feeRateBps: 0,
    },
    {
      id: "item_2",
      title: "Lámpara",
      notes: null,
      imageUrl: "http://localhost:4010/meli/img/x.svg",
      sourceUrl: null,
      sourceType: "MANUAL",
      priceMinor: 5_299_900n,
      targetAmountMinor: null,
      fundedMinor: 0n,
      availability: "UNAVAILABLE",
      feeRateBps: 100,
    },
  ],
};

/** Local schema for the JSON-LD we emit (schema.org ItemList of Products). */
const offerSchema = z.object({
  "@type": z.literal("Offer"),
  price: z.string().regex(/^\d+\.\d{2}$/),
  priceCurrency: z.literal("ARS"),
  availability: z.enum(["https://schema.org/InStock", "https://schema.org/OutOfStock"]),
  url: z.url().optional(),
});
const jsonLdSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.literal("ItemList"),
  name: z.string().min(1),
  url: z.url(),
  numberOfItems: z.number().int(),
  itemListElement: z.array(
    z.object({
      "@type": z.literal("ListItem"),
      position: z.number().int().positive(),
      item: z.object({
        "@type": z.literal("Product"),
        name: z.string().min(1),
        image: z.url().optional(),
        url: z.url().optional(),
        description: z.string().optional(),
        offers: offerSchema.optional(),
      }),
    }),
  ),
});

const PERSONAL_OR_INTERNAL = [/clist_internal_123/, /item_\d/, /ownerId/, /@example\.com/, /Ana Pérez/];

describe("JSON-LD ItemList", () => {
  const jsonLd = buildItemListJsonLd(list, "https://quieroeso.app/l/cumple-de-ana-abc123");

  it("matches the local ItemList/Product schema", () => {
    expect(() => jsonLdSchema.parse(jsonLd)).not.toThrow();
    expect(jsonLd.itemListElement[0]?.item).toMatchObject({
      offers: { price: "189999.99", availability: "https://schema.org/InStock" },
    });
    expect(jsonLd.itemListElement[1]?.item).not.toHaveProperty("image");
  });

  it("contains no personal data or internal identifiers", () => {
    const text = JSON.stringify(jsonLd);
    for (const pattern of PERSONAL_OR_INTERNAL) expect(text).not.toMatch(pattern);
  });

  it("escapes script breakouts", () => {
    const script = jsonLdScript(jsonLd);
    expect(script).not.toContain("</script>");
    expect(JSON.parse(script)).toEqual(jsonLd);
  });
});

describe("public JSON", () => {
  it("exposes product data and funding without internal ids", () => {
    const json = toPublicListJson(list, "https://quieroeso.app/l/cumple-de-ana-abc123");
    expect(json.items[0]).toMatchObject({
      price: { amount: "189999.99", currency: "ARS" },
      funding: { target: "189999.99", funded: "50000.00" },
    });
    expect(json.items[1]?.funding).toBeNull();
    const text = JSON.stringify(json);
    for (const pattern of PERSONAL_OR_INTERNAL) expect(text).not.toMatch(pattern);
  });
});

describe("listDescription", () => {
  it("falls back to an item count and stays short", () => {
    expect(listDescription(list)).toBe("Lista de deseos con 2 productos. Mirala y regalá algo en QuieroEso.");
    expect(listDescription({ ...list, description: "x".repeat(400) }).length).toBeLessThanOrEqual(180);
  });
});
