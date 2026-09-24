const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts a decimal major-unit amount (e.g. "1234.5", or 1234.5 from a provider
 * API) to minor units without floating point arithmetic. Extra fraction digits
 * are rounded half-up.
 */
export function toMinorUnits(value: string | number, fractionDigits = 2): bigint {
  const text = typeof value === "number" ? numberToPlainString(value) : value.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match?.[1]) {
    throw new RangeError(`invalid decimal amount: ${text}`);
  }
  const integer = BigInt(match[1]);
  const fraction = match[2] ?? "";
  const kept = fraction.slice(0, fractionDigits).padEnd(fractionDigits, "0");
  const scale = 10n ** BigInt(fractionDigits);
  let minor = integer * scale + BigInt(kept || "0");
  const nextDigit = fraction.charAt(fractionDigits);
  if (nextDigit !== "" && Number(nextDigit) >= 5) minor += 1n;
  return minor;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("amount must be a finite, non-negative number");
  }
  // toFixed(6) avoids exponent notation while keeping enough precision for prices.
  return value.toFixed(6);
}
