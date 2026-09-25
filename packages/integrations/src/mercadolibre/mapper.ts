import { z } from "zod";
import { toMinorUnits } from "../shared/decimal";

export type ProductSnapshotInput = {
  externalId: string;
  kind: "ITEM" | "CATALOG_PRODUCT";
  canonicalUrl: string;
  title: string;
  imageUrl: string | null;
  priceMinor: bigint | null;
  currency: "ARS";
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
};

const picture = z.object({
  url: z.string().optional(),
  secure_url: z.string().optional(),
});

export const itemResponseSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  price: z.number().nonnegative().nullable().optional(),
  currency_id: z.string().nullable().optional(),
  status: z.string(),
  permalink: z.string().optional(),
  thumbnail: z.string().optional(),
  pictures: z.array(picture).optional(),
});

export const productResponseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  status: z.string(),
  permalink: z.string().optional(),
  pictures: z.array(picture).optional(),
  buy_box_winner: z
    .object({ price: z.number().nonnegative(), currency_id: z.string() })
    .nullable()
    .optional(),
  buy_box_winner_price_range: z
    .object({
      min: z.object({ price: z.number().nonnegative(), currency_id: z.string() }).nullable().optional(),
    })
    .nullable()
    .optional(),
});

/** Listings competing for a catalog product (`/products/{id}/items`). */
export const productItemsResponseSchema = z.object({
  results: z
    .array(
      z.object({
        price: z.number().nonnegative().nullable().optional(),
        currency_id: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

/** Mercado Libre CDN images are served over https even when the API says http. */
function normalizeImage(candidate: string | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" && url.hostname.endsWith("mlstatic.com")) url.protocol = "https:";
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function price(
  value: number | null | undefined,
  currency: string | null | undefined,
): bigint | null {
  if (value === null || value === undefined || currency !== "ARS") return null;
  return toMinorUnits(value);
}

const ITEM_STATUS: Record<string, ProductSnapshotInput["availability"]> = {
  active: "AVAILABLE",
  paused: "UNAVAILABLE",
  closed: "UNAVAILABLE",
  inactive: "UNAVAILABLE",
};

export function mapItem(raw: unknown, canonicalUrl: string): ProductSnapshotInput {
  const item = itemResponseSchema.parse(raw);
  const firstPicture = item.pictures?.[0];
  return {
    externalId: item.id,
    kind: "ITEM",
    canonicalUrl,
    title: item.title.trim(),
    imageUrl: normalizeImage(firstPicture?.secure_url ?? firstPicture?.url ?? item.thumbnail),
    priceMinor: price(item.price, item.currency_id),
    currency: "ARS",
    availability: ITEM_STATUS[item.status] ?? "UNKNOWN",
  };
}

export function mapCatalogProduct(raw: unknown, canonicalUrl: string): ProductSnapshotInput {
  const product = productResponseSchema.parse(raw);
  const winner = product.buy_box_winner ?? null;
  // Without a buy box winner the page can still list offers; the cheapest one is the best
  // reference price we have.
  const cheapest = product.buy_box_winner_price_range?.min ?? null;
  const fallbackPrice = cheapest ? price(cheapest.price, cheapest.currency_id) : null;
  const firstPicture = product.pictures?.[0];
  return {
    externalId: product.id,
    kind: "CATALOG_PRODUCT",
    canonicalUrl,
    title: product.name.trim(),
    imageUrl: normalizeImage(firstPicture?.secure_url ?? firstPicture?.url),
    priceMinor: winner ? price(winner.price, winner.currency_id) : fallbackPrice,
    currency: "ARS",
    availability: product.status !== "active" ? "UNAVAILABLE" : winner ? "AVAILABLE" : "UNKNOWN",
  };
}

/** Lowest ARS price among the listings of a catalog product, or null when there is none. */
export function lowestListingPrice(raw: unknown): bigint | null {
  const { results } = productItemsResponseSchema.parse(raw);
  let lowest: bigint | null = null;
  for (const listing of results) {
    const candidate = price(listing.price, listing.currency_id);
    if (candidate !== null && (lowest === null || candidate < lowest)) lowest = candidate;
  }
  return lowest;
}
