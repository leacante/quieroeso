import type { PrismaClient } from "@quieroeso/db";
import { sha256Hex } from "@quieroeso/integrations/crypto";

/** Statuses that count toward an item's funded amount. */
const FUNDED_STATUSES = ["APPROVED"] as const;

export type PublicItemView = {
  id: string;
  title: string;
  notes: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceType: "MERCADOLIBRE" | "MANUAL";
  priceMinor: bigint | null;
  targetAmountMinor: bigint | null;
  fundedMinor: bigint;
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  feeRateBps: number;
};

/**
 * What visitors may see of a shared list: no owner identity, no internal owner ids,
 * no share token material.
 */
export type PublicListView = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: "PUBLIC" | "UNLISTED";
  fundingMode: "WISHLIST" | "PER_ITEM";
  acceptsContributions: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  items: PublicItemView[];
};

async function toView(db: PrismaClient, listId: string): Promise<PublicListView | null> {
  const list = await db.wishList.findUnique({
    where: { id: listId },
    include: {
      items: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      owner: { select: { mercadoPago: { select: { status: true } } } },
    },
  });
  if (!list || list.archivedAt || list.visibility === "PRIVATE") return null;

  const funded = await db.contribution.groupBy({
    by: ["listItemId"],
    where: {
      listItemId: { in: list.items.map((item) => item.id) },
      status: { in: [...FUNDED_STATUSES] },
    },
    _sum: { amountMinor: true },
  });
  const fundedByItem = new Map(funded.map((row) => [row.listItemId, row._sum.amountMinor ?? 0n]));

  return {
    id: list.id,
    slug: list.slug,
    title: list.title,
    description: list.description,
    visibility: list.visibility,
    fundingMode: list.fundingMode,
    acceptsContributions:
      list.fundingMode === "PER_ITEM" && list.owner.mercadoPago?.status === "ACTIVE",
    publishedAt: list.publishedAt,
    updatedAt: list.updatedAt,
    items: list.items.map((item) => ({
      id: item.id,
      title: item.title,
      notes: item.notes,
      imageUrl: item.imageUrl,
      sourceUrl: item.sourceUrl,
      sourceType: item.sourceType,
      priceMinor: item.priceMinor,
      targetAmountMinor: item.targetAmountMinor,
      fundedMinor: fundedByItem.get(item.id) ?? 0n,
      availability: item.availability,
      feeRateBps: item.feeRateBps,
    })),
  };
}

/** A PUBLIC list by slug, or null (never distinguishes private, unlisted or missing). */
export async function getPublicListBySlug(
  db: PrismaClient,
  slug: string,
): Promise<PublicListView | null> {
  const list = await db.wishList.findFirst({
    where: { slug, visibility: "PUBLIC", archivedAt: null },
    select: { id: true },
  });
  return list ? toView(db, list.id) : null;
}

/**
 * A list reachable through its secret link. Returns null for unknown tokens and
 * for lists made PRIVATE; PUBLIC lists are returned so the caller can redirect
 * to their canonical URL.
 */
export async function getSharedListByToken(
  db: PrismaClient,
  token: string,
): Promise<PublicListView | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const list = await db.wishList.findFirst({
    where: { shareTokenHash: sha256Hex(token), archivedAt: null, visibility: { not: "PRIVATE" } },
    select: { id: true },
  });
  return list ? toView(db, list.id) : null;
}

/** Public lists for the sitemap, newest first. */
export async function listPublicListsForSitemap(db: PrismaClient, limit = 5_000) {
  return db.wishList.findMany({
    where: { visibility: "PUBLIC", archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { slug: true, updatedAt: true },
  });
}
