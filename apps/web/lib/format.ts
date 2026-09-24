import { formatMinor } from "@quieroeso/domain/money";

export function formatMoney(minor: bigint | string | null | undefined): string | null {
  if (minor === null || minor === undefined) return null;
  // Intl uses no-break spaces; plain spaces keep copy/paste and tests predictable.
  return formatMinor(typeof minor === "bigint" ? minor : BigInt(minor)).replace(/\s/g, " ");
}

export const VISIBILITY_LABEL = {
  PRIVATE: "Privada",
  UNLISTED: "Con enlace",
  PUBLIC: "Pública",
} as const;

export const VISIBILITY_HINT = {
  PRIVATE: "Sólo vos la ves.",
  UNLISTED: "La ve quien tenga el enlace. No aparece en buscadores.",
  PUBLIC: "Cualquiera puede verla y aparece en buscadores.",
} as const;

export function feeLabel(bps: number): string {
  return bps === 0 ? "Sin comisión" : `Comisión ${bps / 100}%`;
}

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(value));
}

/** Converts user input like "1.234,50" or "1234.5" to minor units; null if invalid. */
export function parseMoneyInput(input: string): string | null {
  const cleaned = input.replace(/[$\s]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match?.[1]) return null;
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return minor > 0n ? minor.toString() : null;
}
