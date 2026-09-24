import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("reports ok when the database answers", async () => {
    const result = await checkHealth({ $queryRaw: async () => [{ "?column?": 1 }] });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "ok", database: "ok" });
  });

  it("returns 503 when the database fails", async () => {
    const result = await checkHealth({
      $queryRaw: async () => {
        throw new Error("connection refused");
      },
    });
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ status: "degraded", database: "unreachable" });
  });
});
