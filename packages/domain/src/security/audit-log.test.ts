import type { TransactionClient } from "@quieroeso/db";
import { describe, expect, it, vi } from "vitest";
import { writeAuditEvent } from "./audit-log";

describe("writeAuditEvent", () => {
  const tx = { auditEvent: { create: vi.fn(async () => ({})) } } as unknown as TransactionClient;

  it.each(["shareToken", "accessToken", "contributorMessage", "clientSecret", "cookie"])(
    "refuses metadata key %s",
    async (key) => {
      await expect(
        writeAuditEvent(tx, {
          actorUserId: "u",
          action: "list.published",
          targetType: "list",
          targetId: "l",
          metadata: { [key]: "value" },
        }),
      ).rejects.toThrow(/not allowed/);
    },
  );

  it("stores non-sensitive metadata", async () => {
    await writeAuditEvent(tx, {
      actorUserId: "u",
      action: "list.published",
      targetType: "list",
      targetId: "l",
      metadata: { from: "PRIVATE", to: "UNLISTED" },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
  });
});
