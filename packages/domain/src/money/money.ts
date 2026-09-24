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

export { toMinorUnits } from "@quieroeso/integrations/decimal";

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

/** Exact decimal string for minor units, e.g. 123456n -> "1234.56". */
export function minorToDecimalString(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
