import type { PrismaClient } from "@quieroeso/db";
import { purgeExpiredRateLimits } from "./rate-limit";

/** Housekeeping for short-lived security records. */
export async function purgeExpiredSecurityRecords(db: PrismaClient, now = new Date()) {
  const [rateLimits, oauthStates] = await Promise.all([
    purgeExpiredRateLimits(db, now),
    db.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } }).then((result) => result.count),
  ]);
  return { rateLimits, oauthStates };
}
