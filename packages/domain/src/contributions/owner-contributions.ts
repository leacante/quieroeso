import type { PrismaClient } from "@quieroeso/db";

/** Statuses shown to owners; abandoned checkouts (CREATED/CHECKOUT_CREATED) are noise. */
const VISIBLE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "REFUNDED",
  "CHARGED_BACK",
] as const;

/**
 * Contribution history for a list owner. Contains what contributors chose to share
 * (name, message) and never payer data from Mercado Pago.
 */
export async function listOwnerContributions(db: PrismaClient, ownerId: string, limit = 200) {
  const rows = await db.contribution.findMany({
    where: { status: { in: [...VISIBLE_STATUSES] }, listItem: { list: { ownerId } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      amountMinor: true,
      platformFeeRateBps: true,
      platformFeeAmountMinor: true,
      contributorName: true,
      contributorMessage: true,
      approvedAt: true,
      createdAt: true,
      listItem: { select: { title: true, list: { select: { id: true, title: true } } } },
    },
  });
  const approved = rows.filter((row) => row.status === "APPROVED");
  return {
    contributions: rows,
    totals: {
      approvedCount: approved.length,
      approvedMinor: approved.reduce((sum, row) => sum + row.amountMinor, 0n),
      platformFeesMinor: approved.reduce((sum, row) => sum + row.platformFeeAmountMinor, 0n),
    },
  };
}
