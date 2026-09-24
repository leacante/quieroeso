import type { Prisma, PrismaClient } from "@quieroeso/db";
import {
  MercadoLibreApiError,
  type MercadoLibreGateway,
  type ProductSnapshotInput,
} from "@quieroeso/integrations/mercadolibre";
import { getLogger } from "@quieroeso/observability";
import { snapshotToJson } from "./import-item";

export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
/** Claims older than this are considered abandoned by a crashed worker. */
const CLAIM_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 4;

export class SystemicRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemicRefreshError";
  }
}

export type RefreshDeps = {
  db: PrismaClient;
  meli: MercadoLibreGateway;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
};

export type RefreshOptions = {
  batchSize?: number;
  concurrency?: number;
  staleBefore?: Date;
  /** Safety cap on batches per run. */
  maxBatches?: number;
};

export type RefreshSummary = {
  claimed: number;
  refreshed: number;
  unavailable: number;
  failed: number;
};

type ClaimedItem = {
  id: string;
  externalId: string;
  externalKind: string | null;
  sourceUrl: string | null;
  title: string;
  imageUrl: string | null;
  sourceSnapshot: Prisma.JsonValue;
};

/** Atomically claims up to `limit` stale Mercado Libre items; concurrent workers skip locked rows. */
async function claimBatch(
  db: PrismaClient,
  staleBefore: Date,
  limit: number,
  now: Date,
): Promise<ClaimedItem[]> {
  const claimExpiry = new Date(now.getTime() - CLAIM_TTL_MS);
  return db.$queryRaw<ClaimedItem[]>`
    UPDATE "ListItem" AS item
    SET "syncClaimedAt" = ${now}
    WHERE item."id" IN (
      SELECT candidate."id"
      FROM "ListItem" AS candidate
      JOIN "WishList" AS list ON list."id" = candidate."listId"
      WHERE candidate."sourceType" = 'MERCADOLIBRE'
        AND candidate."externalId" IS NOT NULL
        AND candidate."archivedAt" IS NULL
        AND list."archivedAt" IS NULL
        AND (candidate."lastSyncedAt" IS NULL OR candidate."lastSyncedAt" < ${staleBefore})
        AND (candidate."syncClaimedAt" IS NULL OR candidate."syncClaimedAt" < ${claimExpiry})
      ORDER BY candidate."lastSyncedAt" ASC NULLS FIRST
      LIMIT ${limit}
      FOR UPDATE OF candidate SKIP LOCKED
    )
    RETURNING item."id", item."externalId", item."externalKind", item."sourceUrl",
              item."title", item."imageUrl", item."sourceSnapshot"`;
}

const TRANSIENT = new Set(["RATE_LIMITED", "UPSTREAM", "TIMEOUT"]);

/** Fetches with exponential backoff and full jitter for 429/5xx/timeouts. */
async function fetchWithBackoff(
  deps: RefreshDeps,
  item: ClaimedItem,
): Promise<ProductSnapshotInput> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.meli.fetchSnapshot({
        kind: item.externalKind === "CATALOG_PRODUCT" ? "CATALOG_PRODUCT" : "ITEM",
        externalId: item.externalId,
        canonicalUrl: item.sourceUrl ?? "",
      });
    } catch (error) {
      if (
        !(error instanceof MercadoLibreApiError) ||
        !TRANSIENT.has(error.kind) ||
        attempt >= MAX_ATTEMPTS
      ) {
        throw error;
      }
      const base = 500 * 2 ** (attempt - 1);
      const hinted = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 0;
      await sleep(Math.max(hinted, Math.round(random() * base)));
    }
  }
}

type PreviousSnapshot = { title?: unknown; imageUrl?: unknown };

async function applySnapshot(
  db: PrismaClient,
  item: ClaimedItem,
  snapshot: ProductSnapshotInput,
  now: Date,
) {
  const previous = (item.sourceSnapshot ?? {}) as PreviousSnapshot;
  // Presentation fields follow the source only while the owner has not customized them.
  const titleFollowsSource = previous.title === undefined || previous.title === item.title;
  const imageFollowsSource = previous.imageUrl === undefined || previous.imageUrl === item.imageUrl;
  await db.listItem.update({
    where: { id: item.id },
    data: {
      priceMinor: snapshot.priceMinor,
      availability: snapshot.availability,
      sourceSnapshot: snapshotToJson(snapshot, now),
      lastSyncedAt: now,
      lastSyncError: null,
      syncClaimedAt: null,
      ...(titleFollowsSource ? { title: snapshot.title } : {}),
      ...(imageFollowsSource ? { imageUrl: snapshot.imageUrl } : {}),
    },
  });
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Refreshes Mercado Libre snapshots older than 12 hours in batches of 50 with at
 * most 5 concurrent requests. Failures keep the previous snapshot and record a
 * sanitized `lastSyncError`; items become UNAVAILABLE only on a confirmed 404 or
 * inactive status. Throws SystemicRefreshError when credentials are rejected.
 */
export async function refreshStaleProducts(
  deps: RefreshDeps,
  options: RefreshOptions = {},
): Promise<RefreshSummary> {
  const now = deps.now?.() ?? new Date();
  const batchSize = options.batchSize ?? 50;
  const concurrency = options.concurrency ?? 5;
  const staleBefore = options.staleBefore ?? new Date(now.getTime() - STALE_AFTER_MS);
  const maxBatches = options.maxBatches ?? 20;
  const logger = getLogger().child({ job: "refresh-products" });
  const summary: RefreshSummary = { claimed: 0, refreshed: 0, unavailable: 0, failed: 0 };
  let unauthorized = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const items = await claimBatch(deps.db, staleBefore, batchSize, now);
    if (items.length === 0) break;
    summary.claimed += items.length;

    await runPool(items, concurrency, async (item) => {
      try {
        const snapshot = await fetchWithBackoff(deps, item);
        await applySnapshot(deps.db, item, snapshot, now);
        if (snapshot.availability === "UNAVAILABLE") summary.unavailable++;
        else summary.refreshed++;
      } catch (error) {
        if (error instanceof MercadoLibreApiError && error.kind === "NOT_FOUND") {
          await deps.db.listItem.update({
            where: { id: item.id },
            data: {
              availability: "UNAVAILABLE",
              lastSyncedAt: now,
              lastSyncError: "NOT_FOUND",
              syncClaimedAt: null,
            },
          });
          summary.unavailable++;
          return;
        }
        summary.failed++;
        if (error instanceof MercadoLibreApiError && error.kind === "UNAUTHORIZED") unauthorized++;
        const reason = error instanceof MercadoLibreApiError ? error.kind : "INVALID_RESPONSE";
        // Keep the previous snapshot; the item stays stale and is retried next run.
        await deps.db.listItem.update({
          where: { id: item.id },
          data: { lastSyncError: reason, syncClaimedAt: null },
        });
        logger.warn({ itemId: item.id, reason }, "snapshot refresh failed");
      }
    });

    if (unauthorized > 0 && summary.refreshed === 0 && unauthorized === summary.failed) {
      throw new SystemicRefreshError("Mercado Libre rejected the application credentials");
    }
    if (items.length < batchSize) break;
  }

  logger.info(summary, "refresh finished");
  return summary;
}
