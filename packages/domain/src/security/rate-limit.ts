import { createHmac } from "node:crypto";
import type { PrismaClient } from "@quieroeso/db";
import { DomainError } from "../errors";

export type RateLimitRule = { limit: number; windowMs: number };

const TEN_MINUTES = 10 * 60 * 1000;

/** Limits from "Seguridad y privacidad" (plus a publication limit). */
export const RATE_LIMITS = {
  importPerUser: { limit: 20, windowMs: TEN_MINUTES },
  checkoutPerIpAndList: { limit: 10, windowMs: TEN_MINUTES },
  publishPerUser: { limit: 30, windowMs: TEN_MINUTES },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Fixed-window counter persisted in PostgreSQL. The increment is a single atomic
 * upsert, so concurrent requests can never exceed the limit.
 */
export async function consumeRateLimit(
  db: PrismaClient,
  key: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const expiresAt = new Date(windowStart.getTime() + rule.windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
  return { allowed: count <= rule.limit, count, retryAfterSeconds };
}

/** Throws a 429 DomainError when the limit is exceeded. */
export async function enforceRateLimit(
  db: PrismaClient,
  key: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<void> {
  const result = await consumeRateLimit(db, key, rule, now);
  if (!result.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      "Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.",
      {
        retryAfterSeconds: result.retryAfterSeconds,
      },
    );
  }
}

/**
 * Daily-rotating HMAC of a client IP. The raw IP is never stored; the same IP
 * maps to a different value each UTC day, so hashes cannot be linked over time.
 */
export function hashClientIp(ip: string, secret: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${day}:${ip}`).digest("base64url").slice(0, 22);
}

export const rateLimitKeys = {
  import: (userId: string) => `import:user:${userId}`,
  publish: (userId: string) => `publish:user:${userId}`,
  checkout: (ipHash: string, listId: string) => `checkout:ip:${ipHash}:list:${listId}`,
};

/** Deletes expired windows. Returns the number of rows removed. */
export async function purgeExpiredRateLimits(db: PrismaClient, now = new Date()): Promise<number> {
  const result = await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}
