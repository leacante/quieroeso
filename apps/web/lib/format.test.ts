import { describe, expect, it } from "vitest";
import { feeLabel, formatMoney, parseMoneyInput } from "./format";

describe("format helpers", () => {
  it("formats money from bigint or string", () => {
    expect(formatMoney(123_456n)).toBe("$ 1.234,56");
    expect(formatMoney("100000")).toBe("$ 1.000");
    expect(formatMoney(null)).toBeNull();
  });

  it.each([
    ["1.234,50", "123450"],
    ["1234,5", "123450"],
    ["1234.5", "123450"],
    ["1.000", "100000"],
    ["$ 15.000", "1500000"],
    ["20000", "2000000"],
    ["0", null],
    ["abc", null],
    ["1,234", null],
  ])("parses %s", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it("labels fees", () => {
    expect(feeLabel(0)).toBe("Sin comisión");
    expect(feeLabel(100)).toBe("Comisión 1%");
  });
});
