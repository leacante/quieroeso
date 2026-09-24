import type { PublicListView } from "@quieroeso/domain";
import { minorToDecimalString } from "@quieroeso/domain/money";

const MAX_DESCRIPTION = 180;

/** Short, owner-agnostic description for meta tags and previews. */
export function listDescription(list: Pick<PublicListView, "description" | "items">): string {
  const base =
    list.description?.trim() ||
    `Lista de deseos con ${list.items.length} ${list.items.length === 1 ? "producto" : "productos"}.`;
  const text = `${base} Mirala y regalá algo en QuieroEso.`;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}…` : text;
}

const AVAILABILITY = {
  AVAILABLE: "https://schema.org/InStock",
  UNAVAILABLE: "https://schema.org/OutOfStock",
} as const;

/**
 * schema.org ItemList of Products for a PUBLIC list. Contains only product data:
 * no owner identity, internal ids or contribution details.
 */
export function buildItemListJsonLd(list: PublicListView, pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: list.title,
    description: listDescription(list),
    url: pageUrl,
    numberOfItems: list.items.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: list.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: item.title,
        ...(item.notes ? { description: item.notes } : {}),
        ...(item.imageUrl?.startsWith("https://") ? { image: item.imageUrl } : {}),
        ...(item.sourceUrl ? { url: item.sourceUrl } : {}),
        ...(item.priceMinor !== null && item.availability !== "UNKNOWN"
          ? {
              offers: {
                "@type": "Offer",
                price: minorToDecimalString(item.priceMinor),
                priceCurrency: "ARS",
                availability: AVAILABILITY[item.availability],
                ...(item.sourceUrl ? { url: item.sourceUrl } : {}),
              },
            }
          : {}),
      },
    })),
  };
}

/** Serializes JSON-LD safely for an inline <script> (no `</script>` breakout). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Public, read-only JSON representation served at /api/public/lists/{slug}. */
export function toPublicListJson(list: PublicListView, pageUrl: string) {
  return {
    slug: list.slug,
    title: list.title,
    description: list.description,
    url: pageUrl,
    updatedAt: list.updatedAt.toISOString(),
    fundingMode: list.fundingMode,
    acceptsContributions: list.acceptsContributions,
    items: list.items.map((item, index) => ({
      position: index + 1,
      title: item.title,
      notes: item.notes,
      imageUrl: item.imageUrl,
      url: item.sourceUrl,
      source: item.sourceType,
      availability: item.availability,
      price:
        item.priceMinor === null
          ? null
          : { amount: minorToDecimalString(item.priceMinor), currency: "ARS" },
      funding:
        list.acceptsContributions && item.targetAmountMinor !== null
          ? {
              target: minorToDecimalString(item.targetAmountMinor),
              funded: minorToDecimalString(item.fundedMinor),
              currency: "ARS",
            }
          : null,
    })),
  };
}
