import { describe, expect, it } from "vitest";
import { isPublicAddress } from "../shared/network-guard";
import { resolveShortLink, ShortLinkError, type HopFetcher } from "./short-link";
import { parseMercadoLibreUrl, UnsupportedUrlError } from "./url-parser";

function reasonOf(input: string): string | null {
  try {
    parseMercadoLibreUrl(input);
    return null;
  } catch (error) {
    return error instanceof UnsupportedUrlError ? error.reason : "OTHER";
  }
}

describe("parseMercadoLibreUrl — accepted links", () => {
  it("parses a listing URL and strips tracking", () => {
    expect(
      parseMercadoLibreUrl(
        "https://articulo.mercadolibre.com.ar/MLA-1234567890-cafetera-express-oster-_JM?searchVariation=1#polycard_client=search&position=3",
      ),
    ).toEqual({
      type: "REFERENCE",
      kind: "ITEM",
      externalId: "MLA1234567890",
      canonicalUrl: "https://articulo.mercadolibre.com.ar/MLA-1234567890",
    });
  });

  it("parses a catalog product URL", () => {
    expect(
      parseMercadoLibreUrl(
        "https://www.mercadolibre.com.ar/smart-tv-samsung-50/p/MLA20000002?pdp_filters=category:MLA1002",
      ),
    ).toMatchObject({ kind: "CATALOG_PRODUCT", externalId: "MLA20000002" });
  });

  it("prefers the specific listing when a catalog URL carries wid", () => {
    expect(
      parseMercadoLibreUrl(
        "https://www.mercadolibre.com.ar/robot/p/MLA20000001?wid=MLA1000000012&sid=search",
      ),
    ).toMatchObject({ kind: "ITEM", externalId: "MLA1000000012" });
  });

  it("accepts uppercase hosts and a trailing dot", () => {
    expect(
      parseMercadoLibreUrl("https://ARTICULO.MercadoLibre.com.ar./MLA-1234567890-x-_JM"),
    ).toMatchObject({ externalId: "MLA1234567890" });
  });

  it("reads the listing of a user product link from pdp_filters", () => {
    expect(
      parseMercadoLibreUrl(
        "https://www.mercadolibre.com.ar/aplique-techo-barral-slim-spot-5-luces-dicroica-led-incluida/up/MLAU3914430684?pdp_filters=item_id%3AMLA3202924364&sid=bookmarks",
      ),
    ).toEqual({
      type: "REFERENCE",
      kind: "ITEM",
      externalId: "MLA3202924364",
      canonicalUrl: "https://articulo.mercadolibre.com.ar/MLA-3202924364",
    });
  });

  it("reads the listing of a user product link from the wid in the fragment", () => {
    expect(
      parseMercadoLibreUrl(
        "https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684#polycard_client=bookmark&wid=MLA3202924364",
      ),
    ).toMatchObject({ kind: "ITEM", externalId: "MLA3202924364" });
  });

  it("recognizes meli.la short links without fetching them", () => {
    const parsed = parseMercadoLibreUrl("https://meli.la/2AbCdEf");
    expect(parsed.type).toBe("SHORT_LINK");
  });
});

describe("parseMercadoLibreUrl — rejected links", () => {
  it.each([
    ["http://articulo.mercadolibre.com.ar/MLA-1234567890-x", "NOT_HTTPS"],
    ["ftp://mercadolibre.com.ar/MLA-1234567890", "NOT_HTTPS"],
    ["javascript:alert(1)", "NOT_HTTPS"],
    ["https://user:pass@articulo.mercadolibre.com.ar/MLA-1234567890", "CREDENTIALS"],
    ["https://articulo.mercadolibre.com.ar:8443/MLA-1234567890", "PORT"],
    ["https://mercadolibre.com.ar.evil.com/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://evilmercadolibre.com.ar/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://mercadolibre.com/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://mercadolibre.com.mx/MLM-1234567890", "HOST_NOT_ALLOWED"],
    ["https://localhost/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://127.0.0.1/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://[::1]/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://169.254.169.254/latest/meta-data", "HOST_NOT_ALLOWED"],
    ["https://10.0.0.5/MLA-1234567890", "HOST_NOT_ALLOWED"],
    ["https://www.mercadolibre.com.ar/ofertas", "NO_PRODUCT_ID"],
    ["https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684", "USER_PRODUCT_ONLY"],
    [
      "https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684?pdp_filters=item_id%3AMLB3202924364",
      "USER_PRODUCT_ONLY",
    ],
    ["https://meli.la/", "NO_PRODUCT_ID"],
    ["not a url", "INVALID_URL"],
    ["", "INVALID_URL"],
  ])("%s -> %s", (input, reason) => {
    expect(reasonOf(input)).toBe(reason);
  });
});

describe("resolveShortLink", () => {
  function hops(locations: (string | null)[]): HopFetcher {
    let index = 0;
    return async () => {
      const location = locations[index++] ?? null;
      return { status: location ? 301 : 200, location };
    };
  }

  it("follows a short link to a product", async () => {
    const reference = await resolveShortLink(
      new URL("https://meli.la/abc"),
      hops(["https://articulo.mercadolibre.com.ar/MLA-1000000001-cafetera-_JM"]),
    );
    expect(reference).toMatchObject({ kind: "ITEM", externalId: "MLA1000000001" });
  });

  it("validates every hop and rejects private or http destinations", async () => {
    await expect(
      resolveShortLink(new URL("https://meli.la/evil"), hops(["http://169.254.169.254/latest"])),
    ).rejects.toThrow(UnsupportedUrlError);
    await expect(
      resolveShortLink(new URL("https://meli.la/evil"), hops(["https://10.0.0.1/MLA-1234567"])),
    ).rejects.toThrow(UnsupportedUrlError);
  });

  it("gives up after three redirects", async () => {
    const loop = hops([
      "https://meli.la/a",
      "https://meli.la/b",
      "https://meli.la/c",
      "https://meli.la/d",
    ]);
    await expect(resolveShortLink(new URL("https://meli.la/start"), loop)).rejects.toMatchObject({
      reason: "TOO_MANY_REDIRECTS",
    });
  });

  it("rejects non-redirect responses", async () => {
    await expect(resolveShortLink(new URL("https://meli.la/x"), hops([null]))).rejects.toThrow(
      ShortLinkError,
    );
  });
});

describe("isPublicAddress", () => {
  it.each([
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fe80::1", false],
    ["fd00::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:8.8.8.8", true],
    ["8.8.8.8", true],
    ["2800:810:0:1::1", true],
    ["not-an-ip", false],
  ])("%s -> %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});
