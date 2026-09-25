import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMercadoLibreClient, MercadoLibreApiError } from "./client";

function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, "__fixtures__", `${name}.json`), "utf8");
}

type Route = (request: Request) => Response | undefined;

/** Replays recorded responses; records every request for assertions. */
function fakeApi(routes: Record<string, Route>) {
  const calls: Request[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    const url = new URL(request.url);
    const handler = routes[`${request.method} ${url.pathname}`];
    return handler?.(request) ?? new Response(fixture("error-404"), { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "application/json", ...headers } });

const tokenRoute: Route = () => json(fixture("token"));

function client(routes: Record<string, Route>) {
  const api = fakeApi({ "POST /oauth/token": tokenRoute, ...routes });
  const meli = createMercadoLibreClient({
    baseUrl: "https://api.mercadolibre.com",
    clientId: "app",
    clientSecret: "secret",
    fetch: api.fetchImpl,
  });
  return { meli, calls: api.calls };
}

const itemRef = {
  kind: "ITEM" as const,
  externalId: "MLA1234567890",
  canonicalUrl: "https://articulo.mercadolibre.com.ar/MLA-1234567890",
};

describe("Mercado Libre client (recorded fixtures)", () => {
  it("maps an active listing to a snapshot", async () => {
    const { meli, calls } = client({
      "GET /items/MLA1234567890": () => json(fixture("item-active")),
    });
    const snapshot = await meli.fetchSnapshot(itemRef);
    expect(snapshot).toEqual({
      externalId: "MLA1234567890",
      kind: "ITEM",
      canonicalUrl: itemRef.canonicalUrl,
      title: "Cafetera Express Oster 15 Bares Acero Inoxidable",
      imageUrl: "https://http2.mlstatic.com/D_600000-MLA00000000001_012026-O.jpg",
      priceMinor: 18_999_999n,
      currency: "ARS",
      availability: "AVAILABLE",
    });

    const itemCall = calls.find((call) => call.url.endsWith("/items/MLA1234567890"))!;
    expect(itemCall.headers.get("authorization")).toMatch(/^Bearer APP_USR-/);
    expect(itemCall.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const tokenCall = calls.find((call) => call.url.endsWith("/oauth/token"))!;
    expect(await tokenCall.text()).toContain("grant_type=client_credentials");
  });

  it("marks paused listings unavailable and upgrades thumbnail to https", async () => {
    const { meli } = client({ "GET /items/MLA1111111111": () => json(fixture("item-paused")) });
    const snapshot = await meli.fetchSnapshot({ ...itemRef, externalId: "MLA1111111111" });
    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.imageUrl).toMatch(/^https:\/\/http2\.mlstatic\.com\//);
  });

  it("maps a catalog product using the buy box winner price", async () => {
    const { meli } = client({
      "GET /products/MLA20000002": () => json(fixture("product-catalog")),
    });
    const snapshot = await meli.fetchSnapshot({
      kind: "CATALOG_PRODUCT",
      externalId: "MLA20000002",
      canonicalUrl: "https://www.mercadolibre.com.ar/p/MLA20000002",
    });
    expect(snapshot).toMatchObject({
      kind: "CATALOG_PRODUCT",
      title: "Smart TV Samsung 50 Crystal UHD 4K",
      priceMinor: 69_999_900n,
      availability: "AVAILABLE",
    });
  });

  const catalogRef = {
    kind: "CATALOG_PRODUCT" as const,
    externalId: "MLA20000002",
    canonicalUrl: "https://www.mercadolibre.com.ar/p/MLA20000002",
  };
  const withoutWinner = (extra: Record<string, unknown> = {}) => {
    const product = JSON.parse(fixture("product-catalog")) as Record<string, unknown>;
    return JSON.stringify({ ...product, buy_box_winner: null, ...extra });
  };

  it("uses the cheapest offer when the catalog product has no buy box winner", async () => {
    const { meli, calls } = client({
      "GET /products/MLA20000002": () =>
        json(
          withoutWinner({
            buy_box_winner_price_range: { min: { price: 650000, currency_id: "ARS" } },
          }),
        ),
    });
    const snapshot = await meli.fetchSnapshot(catalogRef);
    expect(snapshot.priceMinor).toBe(65_000_000n);
    expect(calls.some((call) => call.url.endsWith("/items"))).toBe(false);
  });

  it("prices a catalog product from its lowest ARS listing as a last resort", async () => {
    const { meli } = client({
      "GET /products/MLA20000002": () => json(withoutWinner()),
      "GET /products/MLA20000002/items": () =>
        json(
          JSON.stringify({
            results: [
              { item_id: "MLA1", price: 720000, currency_id: "ARS" },
              { item_id: "MLA2", price: 500, currency_id: "USD" },
              { item_id: "MLA3", price: 689999.5, currency_id: "ARS" },
            ],
          }),
        ),
    });
    const snapshot = await meli.fetchSnapshot(catalogRef);
    expect(snapshot.priceMinor).toBe(68_999_950n);
  });

  it("keeps the catalog snapshot without a price when listings are unavailable", async () => {
    const { meli } = client({
      "GET /products/MLA20000002": () => json(withoutWinner()),
      "GET /products/MLA20000002/items": () => json('{"error":"forbidden"}', 403),
    });
    const snapshot = await meli.fetchSnapshot(catalogRef);
    expect(snapshot).toMatchObject({ title: "Smart TV Samsung 50 Crystal UHD 4K", priceMinor: null });
  });

  it("falls back to the catalog product when the item is 403 to the app token", async () => {
    const { meli, calls } = client({
      "GET /items/MLA1234567890": () => json('{"error":"access_denied"}', 403),
      "GET /products/MLA20000002": () => json(fixture("product-catalog")),
    });
    const snapshot = await meli.fetchSnapshot({ ...itemRef, fallbackCatalogProductId: "MLA20000002" });
    expect(snapshot).toMatchObject({ kind: "CATALOG_PRODUCT", externalId: "MLA20000002" });
    expect(calls.some((call) => call.url.endsWith("/products/MLA20000002"))).toBe(true);
  });

  it("still throws when a 403 item has no fallback catalog product", async () => {
    const { meli } = client({
      "GET /items/MLA1234567890": () => json('{"error":"access_denied"}', 403),
    });
    await expect(meli.fetchSnapshot(itemRef)).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
  });

  it("reuses the application token", async () => {
    const { meli, calls } = client({
      "GET /items/MLA1234567890": () => json(fixture("item-active")),
    });
    await meli.fetchSnapshot(itemRef);
    await meli.fetchSnapshot(itemRef);
    expect(calls.filter((call) => call.url.endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("refreshes the token once on 401", async () => {
    let first = true;
    const { meli, calls } = client({
      "GET /items/MLA1234567890": () => {
        if (first) {
          first = false;
          return json('{"message":"invalid_token"}', 401);
        }
        return json(fixture("item-active"));
      },
    });
    await expect(meli.fetchSnapshot(itemRef)).resolves.toMatchObject({ availability: "AVAILABLE" });
    expect(calls.filter((call) => call.url.endsWith("/oauth/token"))).toHaveLength(2);
  });

  it.each([
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM"],
    [403, "UNAUTHORIZED"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    const { meli } = client({
      "GET /items/MLA1234567890": () =>
        json("{}", status, status === 429 ? { "Retry-After": "7" } : {}),
    });
    const error = await meli.fetchSnapshot(itemRef).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MercadoLibreApiError);
    expect(error).toMatchObject({ kind, status });
    if (status === 429) expect(error).toMatchObject({ retryAfterSeconds: 7 });
  });

  it("rejects malformed payloads instead of storing garbage", async () => {
    const { meli } = client({ "GET /items/MLA1234567890": () => json('{"id":"MLA1"}') });
    await expect(meli.fetchSnapshot(itemRef)).rejects.toThrow();
  });
});
