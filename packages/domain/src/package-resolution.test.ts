import { describe, expect, it } from "vitest";
import { parseEnvironment } from "@quieroeso/config";
import { createLogger } from "@quieroeso/observability";
import { calculateFeeMinor } from "./index";

describe("workspace package resolution", () => {
  it("resolves sibling workspace packages", () => {
    expect(typeof parseEnvironment).toBe("function");
    expect(typeof createLogger).toBe("function");
    expect(calculateFeeMinor(100n, 100n)).toBe(1n);
  });
});
