import { Agent, fetch as undiciFetch } from "undici";
import { guardedLookup } from "../shared/network-guard";
import { parseMercadoLibreUrl, type MercadoLibreReference } from "./url-parser";

export const MAX_SHORT_LINK_REDIRECTS = 3;
const HOP_TIMEOUT_MS = 5_000;

export type HopResult = { status: number; location: string | null };
/** Performs a single request without following redirects. */
export type HopFetcher = (url: URL) => Promise<HopResult>;

export class ShortLinkError extends Error {
  constructor(readonly reason: "NOT_A_REDIRECT" | "TOO_MANY_REDIRECTS" | "NETWORK") {
    super(`short link resolution failed: ${reason}`);
    this.name = "ShortLinkError";
  }
}

/**
 * Follows a meli.la short link manually. Every Location is validated with the same
 * rules as user input (https, allowed hosts, no credentials). Only meli.la URLs are
 * ever requested: once a hop points to a Mercado Libre product it is parsed, not fetched.
 */
export async function resolveShortLink(
  start: URL,
  fetchHop: HopFetcher,
  maxRedirects = MAX_SHORT_LINK_REDIRECTS,
): Promise<MercadoLibreReference> {
  let current = start;
  for (let hop = 0; hop < maxRedirects; hop++) {
    let result: HopResult;
    try {
      result = await fetchHop(current);
    } catch {
      throw new ShortLinkError("NETWORK");
    }
    if (result.status < 300 || result.status >= 400 || !result.location) {
      throw new ShortLinkError("NOT_A_REDIRECT");
    }
    const next = parseMercadoLibreUrl(new URL(result.location, current).toString());
    if (next.type === "REFERENCE") {
      const { type: _type, ...reference } = next;
      return reference;
    }
    current = next.url;
  }
  throw new ShortLinkError("TOO_MANY_REDIRECTS");
}

let guardedAgent: Agent | undefined;

/**
 * Production hop fetcher: connects only to public addresses (validated at socket
 * connect time), never follows redirects and never reads the body.
 */
export const guardedHopFetcher: HopFetcher = async (url) => {
  guardedAgent ??= new Agent({
    connect: { lookup: guardedLookup },
    connectTimeout: HOP_TIMEOUT_MS,
  });
  const response = await undiciFetch(url, {
    method: "GET",
    redirect: "manual",
    dispatcher: guardedAgent,
    signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    headers: { "User-Agent": "QuieroEsoBot/1.0 (+link preview)" },
  });
  await response.body?.cancel();
  return { status: response.status, location: response.headers.get("location") };
};

/**
 * Local-development hop fetcher: maps https://meli.la/{code} to the mock server.
 * Only used when MOCK_PROVIDERS=true (the mock base URL is operator-configured).
 */
export function createMockHopFetcher(mockBaseUrl: string): HopFetcher {
  return async (url) => {
    const target = new URL(`/meli-la${url.pathname}`, mockBaseUrl);
    const response = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return { status: response.status, location: response.headers.get("location") };
  };
}
