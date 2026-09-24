import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./navigation";

describe("safeReturnPath", () => {
  it.each([
    ["/dashboard/lists", "/dashboard/lists"],
    [undefined, "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["dashboard", "/dashboard"],
  ])("%s -> %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});
