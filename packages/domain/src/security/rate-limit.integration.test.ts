import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { publishList } from "../lists/list-service";
import { createListWithItems, createTestUser, useTestDatabase } from "../testing/fixtures";
import {
  consumeRateLimit,
  enforceRateLimit,
  hashClientIp,
  purgeExpiredRateLimits,
  RATE_LIMITS,
  rateLimitKeys,
} from "./rate-limit";

const ctx = useTestDatabase();
const SECRET = "x".repeat(32);

describe("consumeRateLimit", () => {
  it("allows 20 imports per user per 10 minutes, separately per user", async () => {
    const now = new Date("2026-09-24T12:00:00Z");
    for (let i = 0; i < 20; i++) {
      expect((await consumeRateLimit(ctx.db, rateLimitKeys.import("ana"), RATE_LIMITS.importPerUser, now)).allowed).toBe(true);
    }
    const blocked = await consumeRateLimit(ctx.db, rateLimitKeys.import("ana"), RATE_LIMITS.importPerUser, now);
    expect(blocked).toMatchObject({ allowed: false, count: 21, retryAfterSeconds: 600 });
    expect((await consumeRateLimit(ctx.db, rateLimitKeys.import("bruno"), RATE_LIMITS.importPerUser, now)).allowed).toBe(true);

    const nextWindow = new Date("2026-09-24T12:10:00Z");
    expect((await consumeRateLimit(ctx.db, rateLimitKeys.import("ana"), RATE_LIMITS.importPerUser, nextWindow)).allowed).toBe(
      true,
    );
  });

  it("limits checkouts per IP hash and list", async () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const ip = hashClientIp("203.0.113.7", SECRET, now);
    for (let i = 0; i < 10; i++) {
      await enforceRateLimit(ctx.db, rateLimitKeys.checkout(ip, "list-a"), RATE_LIMITS.checkoutPerIpAndList, now);
    }
    const error = await enforceRateLimit(ctx.db, rateLimitKeys.checkout(ip, "list-a"), RATE_LIMITS.checkoutPerIpAndList, now).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", status: 429, extra: { retryAfterSeconds: 600 } });

    // Another list, or another IP, has its own budget.
    await enforceRateLimit(ctx.db, rateLimitKeys.checkout(ip, "list-b"), RATE_LIMITS.checkoutPerIpAndList, now);
    const otherIp = hashClientIp("198.51.100.1", SECRET, now);
    await enforceRateLimit(ctx.db, rateLimitKeys.checkout(otherIp, "list-a"), RATE_LIMITS.checkoutPerIpAndList, now);
  });

  it("never exceeds the limit under concurrency", async () => {
    const key = `concurrent:${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 25 }, () => consumeRateLimit(ctx.db, key, { limit: 10, windowMs: 60_000 })),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
  });

  it("purges expired windows", async () => {
    await consumeRateLimit(ctx.db, "old", { limit: 1, windowMs: 60_000 }, new Date("2026-01-01T00:00:00Z"));
    await consumeRateLimit(ctx.db, "current", { limit: 1, windowMs: 60_000 });
    expect(await purgeExpiredRateLimits(ctx.db)).toBe(1);
    expect(await ctx.db.rateLimitBucket.count()).toBe(1);
  });
});

describe("IP hashing", () => {
  it("is stable within a day, rotates daily and never contains the IP", () => {
    const day1 = new Date("2026-09-24T01:00:00Z");
    const later = new Date("2026-09-24T23:00:00Z");
    const day2 = new Date("2026-09-25T01:00:00Z");
    const hash = hashClientIp("203.0.113.7", SECRET, day1);
    expect(hashClientIp("203.0.113.7", SECRET, later)).toBe(hash);
    expect(hashClientIp("203.0.113.7", SECRET, day2)).not.toBe(hash);
    expect(hash).not.toContain("203");
  });
});

describe("audit trail", () => {
  it("records publication without share tokens or secret links", async () => {
    const owner = await createTestUser(ctx.db);
    const { list } = await createListWithItems(ctx.db, owner.id, 1);
    const { shareToken } = await publishList(ctx.deps, { listId: list.id, ownerId: owner.id, visibility: "UNLISTED" });
    const events = await ctx.db.auditEvent.findMany({ where: { targetId: list.id } });
    expect(events.map((event) => event.action).sort()).toEqual(["free_tier.assigned", "list.published"]);
    expect(JSON.stringify(events)).not.toContain(shareToken!);
    expect(JSON.stringify(events)).not.toContain(shareToken!.slice(0, 12));
  });
});
