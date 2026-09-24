/** Basis points in one whole (100%). */
export const BPS_DENOMINATOR = 10_000n;

export const PLATFORM_FEE_BPS = {
  FREE: 0,
  STANDARD: 100,
} as const;

/**
 * Platform fee in minor units using half-up rounding to the cent.
 * Only defined for non-negative amounts and rates.
 */
export function calculateFeeMinor(amountMinor: bigint, rateBps: bigint): bigint {
  if (amountMinor < 0n || rateBps < 0n) {
    throw new RangeError("amount and rate must be non-negative");
  }
  return (amountMinor * rateBps + 5_000n) / BPS_DENOMINATOR;
}

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts a decimal major-unit amount (e.g. "1234.5" or 1234.5 from a provider API)
 * to minor units without floating point arithmetic. Extra fraction digits are
 * rounded half-up.
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
  // toFixed(6) avoids exponent notation for provider prices while keeping enough precision.
  return value.toFixed(6);
}

/** Formats minor units as an ARS string for display, e.g. 123456n -> "$ 1.234,56". */
export function formatMinor(amountMinor: bigint, currency = "ARS", locale = "es-AR"): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const integer = abs / 100n;
  const cents = abs % 100n;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: cents === 0n ? 0 : 2,
    maximumFractionDigits: 2,
  });
  // Intl.NumberFormat accepts decimal strings, which keeps bigint precision intact.
  const decimal = `${integer}.${cents.toString().padStart(2, "0")}` as `${number}`;
  const formatted = formatter.format(decimal);
  return negative ? `-${formatted}` : formatted;
}

/** Converts minor units to a decimal number for provider APIs that require it (e.g. unit_price). */
export function minorToDecimalNumber(amountMinor: bigint): number {
  const integer = amountMinor / 100n;
  const cents = amountMinor % 100n;
  return Number(`${integer}.${cents.toString().padStart(2, "0")}`);
}
