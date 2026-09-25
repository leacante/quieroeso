import { randomUUID } from "node:crypto";
import { getLogger, type Logger } from "@quieroeso/observability";
import { mapCatalogProduct, mapItem, type ProductSnapshotInput } from "./mapper";
import type { MercadoLibreReference } from "./url-parser";

export type MercadoLibreErrorKind =
  "NOT_FOUND" | "RATE_LIMITED" | "UNAUTHORIZED" | "UPSTREAM" | "TIMEOUT";

export class MercadoLibreApiError extends Error {
  constructor(
    readonly kind: MercadoLibreErrorKind,
    readonly status: number | null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`Mercado Libre API error: ${kind}${status ? ` (${status})` : ""}`);
    this.name = "MercadoLibreApiError";
  }
}

export type MercadoLibreGateway = {
  fetchSnapshot(reference: MercadoLibreReference): Promise<ProductSnapshotInput>;
};

export type MercadoLibreClientOptions = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  logger?: Logger;
  now?: () => number;
};

type AppToken = { value: string; expiresAt: number };

/**
 * Official API client. Uses an application token (client credentials), a 5 second
 * timeout, a request id per call and explicit handling of 401, 404 and 429.
 */
export function createMercadoLibreClient(options: MercadoLibreClientOptions): MercadoLibreGateway {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const now = options.now ?? Date.now;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const logger = options.logger ?? getLogger().child({ integration: "mercadolibre" });
  let token: AppToken | null = null;
  let pendingToken: Promise<AppToken> | null = null;

  async function request(path: string, init: RequestInit): Promise<Response> {
    const requestId = randomUUID();
    const started = now();
    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: { Accept: "application/json", "X-Request-Id": requestId, ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      logger.debug(
        { requestId, path: path.split("?")[0], status: response.status, ms: now() - started },
        "meli request",
      );
      return response;
    } catch (error) {
      const kind = error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "UPSTREAM";
      logger.warn({ requestId, path: path.split("?")[0], kind }, "meli request failed");
      throw new MercadoLibreApiError(kind, null);
    }
  }

  async function fetchToken(): Promise<AppToken> {
    const response = await request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
    });
    if (!response.ok) {
      throw new MercadoLibreApiError(
        response.status === 429 ? "RATE_LIMITED" : "UNAUTHORIZED",
        response.status,
      );
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new MercadoLibreApiError("UNAUTHORIZED", response.status);
    return { value: body.access_token, expiresAt: now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  }

  async function appToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && token && token.expiresAt > now()) return token.value;
    pendingToken ??= fetchToken().finally(() => {
      pendingToken = null;
    });
    token = await pendingToken;
    return token.value;
  }

  async function getJson(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(path, {
        method: "GET",
        headers: { Authorization: `Bearer ${await appToken(attempt > 0)}` },
      });
      if (response.ok) return response.json();
      await response.body?.cancel();
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 404) throw new MercadoLibreApiError("NOT_FOUND", 404);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new MercadoLibreApiError(
          "RATE_LIMITED",
          429,
          Number.isFinite(retryAfter) ? retryAfter : null,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new MercadoLibreApiError("UNAUTHORIZED", response.status);
      }
      throw new MercadoLibreApiError("UPSTREAM", response.status);
    }
    throw new MercadoLibreApiError("UNAUTHORIZED", 401);
  }

  return {
    async fetchSnapshot(reference) {
      const id = encodeURIComponent(reference.externalId);
      if (reference.kind === "CATALOG_PRODUCT") {
        return mapCatalogProduct(await getJson(`/products/${id}`), reference.canonicalUrl);
      }
      try {
        return mapItem(await getJson(`/items/${id}`), reference.canonicalUrl);
      } catch (error) {
        // Mercado Libre increasingly refuses /items/{id} to app-only tokens for listings
        // owned by other sellers (403). The catalog product (same page) is still public.
        if (
          error instanceof MercadoLibreApiError &&
          error.kind === "UNAUTHORIZED" &&
          reference.fallbackCatalogProductId
        ) {
          const catalogId = encodeURIComponent(reference.fallbackCatalogProductId);
          return mapCatalogProduct(await getJson(`/products/${catalogId}`), reference.canonicalUrl);
        }
        throw error;
      }
    },
  };
}
