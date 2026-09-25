/** Mercado Libre Argentina listing (MLA...) or catalog product reference. */
export type MercadoLibreReference = {
  kind: "ITEM" | "CATALOG_PRODUCT";
  externalId: string;
  /** Canonical, tracking-free URL we store and link to. */
  canonicalUrl: string;
  /**
   * Catalog product to fall back to when `kind` is ITEM and Mercado Libre refuses to
   * return the specific listing to an application-only token (403 on /items/{id}).
   */
  fallbackCatalogProductId?: string;
};

export type ParsedMercadoLibreUrl =
  ({ type: "REFERENCE" } & MercadoLibreReference) | { type: "SHORT_LINK"; url: URL };

export type UnsupportedUrlReason =
  "INVALID_URL" | "NOT_HTTPS" | "CREDENTIALS" | "PORT" | "HOST_NOT_ALLOWED" | "NO_PRODUCT_ID";

export class UnsupportedUrlError extends Error {
  constructor(readonly reason: UnsupportedUrlReason) {
    super(`unsupported Mercado Libre URL: ${reason}`);
    this.name = "UnsupportedUrlError";
  }
}

const MAIN_DOMAIN = "mercadolibre.com.ar";
export const SHORT_LINK_HOST = "meli.la";
const MAX_INPUT_LENGTH = 2048;

const ITEM_IN_PATH = /(?:^|\/)MLA-?(\d{6,15})(?=[-_/]|$)/i;
const CATALOG_IN_PATH = /\/p\/MLA(\d{4,15})(?=[/?#]|$)/i;
const ITEM_ID_PARAM = /^MLA-?(\d{6,15})$/i;

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

/** True for mercadolibre.com.ar and its subdomains, never look-alikes. */
export function isMercadoLibreHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return host === MAIN_DOMAIN || host.endsWith(`.${MAIN_DOMAIN}`);
}

function assertSafeShape(url: URL): void {
  if (url.protocol !== "https:") throw new UnsupportedUrlError("NOT_HTTPS");
  if (url.username || url.password) throw new UnsupportedUrlError("CREDENTIALS");
  if (url.port !== "" && url.port !== "443") throw new UnsupportedUrlError("PORT");
}

function itemFromParams(url: URL): string | null {
  for (const key of ["wid", "item_id", "itemId"]) {
    const match = ITEM_ID_PARAM.exec(url.searchParams.get(key) ?? "");
    if (match?.[1]) return match[1];
  }
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const fromHash = ITEM_ID_PARAM.exec(hashParams.get("wid") ?? "");
  return fromHash?.[1] ?? null;
}

/**
 * Parses a user-supplied link without performing any network request.
 * Accepts https links on mercadolibre.com.ar (and subdomains) and meli.la short links.
 */
export function parseMercadoLibreUrl(input: string): ParsedMercadoLibreUrl {
  const text = input.trim();
  if (text.length === 0 || text.length > MAX_INPUT_LENGTH) {
    throw new UnsupportedUrlError("INVALID_URL");
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UnsupportedUrlError("INVALID_URL");
  }
  assertSafeShape(url);
  const host = normalizeHost(url.hostname);

  if (host === SHORT_LINK_HOST) {
    if (url.pathname.length <= 1) throw new UnsupportedUrlError("NO_PRODUCT_ID");
    return { type: "SHORT_LINK", url };
  }
  if (!isMercadoLibreHost(host)) throw new UnsupportedUrlError("HOST_NOT_ALLOWED");

  const path = decodeURIComponent(url.pathname);
  const catalog = CATALOG_IN_PATH.exec(path);
  const listingInCatalog = catalog ? itemFromParams(url) : null;

  if (catalog?.[1] && !listingInCatalog) {
    const externalId = `MLA${catalog[1]}`;
    return {
      type: "REFERENCE",
      kind: "CATALOG_PRODUCT",
      externalId,
      canonicalUrl: `https://www.${MAIN_DOMAIN}/p/${externalId}`,
    };
  }

  const itemDigits = listingInCatalog ?? ITEM_IN_PATH.exec(path)?.[1] ?? itemFromParams(url);
  if (!itemDigits) throw new UnsupportedUrlError("NO_PRODUCT_ID");
  return {
    type: "REFERENCE",
    kind: "ITEM",
    externalId: `MLA${itemDigits}`,
    canonicalUrl: `https://articulo.${MAIN_DOMAIN}/MLA-${itemDigits}`,
    ...(listingInCatalog && catalog?.[1] ? { fallbackCatalogProductId: `MLA${catalog[1]}` } : {}),
  };
}
