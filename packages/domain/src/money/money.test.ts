import { describe, expect, it } from "vitest";
import { calculateFeeMinor, formatMinor, minorToDecimalNumber, toMinorUnits } from "./money";

describe("calculateFeeMinor", () => {
  it("returns zero for a 0% rate", () => {
    expect(calculateFeeMinor(1_234_567n, 0n)).toBe(0n);
  });

  it("computes 1% of whole amounts", () => {
    expect(calculateFeeMinor(100_000n, 100n)).toBe(1_000n);
  });

  it("rounds half up to the cent", () => {
    // 1% of $0.50 = 0.5 cents -> 1 cent
    expect(calculateFeeMinor(50n, 100n)).toBe(1n);
    // 1% of $0.49 = 0.49 cents -> 0 cents
    expect(calculateFeeMinor(49n, 100n)).toBe(0n);
    // 1% of $1234.56 = 1234.56 cents -> 1235 cents
    expect(calculateFeeMinor(123_456n, 100n)).toBe(1_235n);
    // 1% of $1234.49 = 1234.49 cents -> 1234 cents
    expect(calculateFeeMinor(123_449n, 100n)).toBe(1_234n);
  });

  it("stays exact for very large amounts", () => {
    const amount = 9_007_199_254_740_993_123n;
    expect(calculateFeeMinor(amount, 100n)).toBe(90_071_992_547_409_931n);
  });

  it("rejects negative inputs", () => {
    expect(() => calculateFeeMinor(-1n, 100n)).toThrow(RangeError);
  });
});

describe("toMinorUnits", () => {
  it.each([
    ["1234", 123_400n],
    ["1234.5", 123_450n],
    ["1234.56", 123_456n],
    ["0.005", 1n],
    ["0.004", 0n],
  ])("parses %s", (input, expected) => {
    expect(toMinorUnits(input)).toBe(expected);
  });

  it("parses provider floats without binary rounding errors", () => {
    expect(toMinorUnits(0.1 + 0.2)).toBe(30n);
    expect(toMinorUnits(19999.99)).toBe(1_999_999n);
  });

  it("rejects invalid values", () => {
    expect(() => toMinorUnits("-1")).toThrow(RangeError);
    expect(() => toMinorUnits("1e5")).toThrow(RangeError);
    expect(() => toMinorUnits(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatting", () => {
  it("formats ARS amounts", () => {
    expect(formatMinor(123_456n).replace(/\s/g, " ")).toBe("$ 1.234,56");
    expect(formatMinor(100_000n).replace(/\s/g, " ")).toBe("$ 1.000");
  });

  it("converts to decimal numbers for provider APIs", () => {
    expect(minorToDecimalNumber(123_456n)).toBe(1234.56);
    expect(minorToDecimalNumber(5n)).toBe(0.05);
  });
});
