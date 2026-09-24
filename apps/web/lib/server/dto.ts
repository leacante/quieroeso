import type { ListItem, WishList } from "@quieroeso/db";
import { absoluteUrl } from "@/lib/site";

/** Owner-facing list representation. Never includes share token hashes or ciphertext. */
export function toOwnerListDto(list: WishList & { itemCount?: number; isPromotional?: boolean }) {
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    slug: list.slug,
    visibility: list.visibility,
    fundingMode: list.fundingMode,
    publishedAt: list.publishedAt,
    updatedAt: list.updatedAt,
    publicUrl: list.visibility === "PUBLIC" ? absoluteUrl(`/l/${list.slug}`) : null,
    ...(list.itemCount === undefined ? {} : { itemCount: list.itemCount }),
    ...(list.isPromotional === undefined ? {} : { isPromotional: list.isPromotional }),
  };
}

export function toOwnerItemDto(item: ListItem) {
  return {
    id: item.id,
    position: item.position,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    externalId: item.externalId,
    title: item.title,
    notes: item.notes,
    imageUrl: item.imageUrl,
    priceMinor: item.priceMinor,
    targetAmountMinor: item.targetAmountMinor,
    currency: item.currency,
    availability: item.availability,
    lastSyncedAt: item.lastSyncedAt,
    feeRateBps: item.feeRateBps,
  };
}
