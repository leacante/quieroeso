import {
  MercadoLibreApiError,
  type HopFetcher,
  type MercadoLibreGateway,
} from "@quieroeso/integrations/mercadolibre";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../errors";
import { createTestUser, useTestDatabase } from "../testing/fixtures";
import { importListItem } from "./import-item";
import { updateItem } from "./item-service";
import { createList } from "./list-service";

const ctx = useTestDatabase();

const gateway: MercadoLibreGateway = {
  fetchSnapshot: vi.fn(async (reference) => {
    if (reference.externalId === "MLA1999999999") throw new MercadoLibreApiError("NOT_FOUND", 404);
    if (reference.externalId === "MLA1403403403") {
      throw new MercadoLibreApiError("UNAUTHORIZED", 403);
    }
    if (reference.externalId === "MLA1429429429") {
      throw new MercadoLibreApiError("RATE_LIMITED", 429, 12);
    }
    return {
      externalId: reference.externalId,
      kind: reference.kind,
      canonicalUrl: reference.canonicalUrl,
      title: "Cafetera Express",
      imageUrl: "https://http2.mlstatic.com/D_1-O.jpg",
      priceMinor: 18_999_999n,
      currency: "ARS" as const,
      availability: "AVAILABLE" as const,
    };
  }),
};

const hops: HopFetcher = async (url) =>
  url.pathname === "/cafetera"
    ? { status: 301, location: "https://articulo.mercadolibre.com.ar/MLA-1000000001-cafetera-_JM" }
    : { status: 301, location: "http://169.254.169.254/latest/meta-data" };

async function setup() {
  const owner = await createTestUser(ctx.db);
  const list = await createList(ctx.db, owner.id, { title: "Casa nueva" });
  return { ref: { listId: list.id, ownerId: owner.id } };
}

const deps = () => ({ db: ctx.db, meli: gateway, fetchHop: hops });

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe("importListItem", () => {
  it("imports a listing with its snapshot and default target", async () => {
    const { ref } = await setup();
    const item = await importListItem(deps(), ref, {
      url: "https://articulo.mercadolibre.com.ar/MLA-1234567890-cafetera-_JM?tracking=1",
    });
    expect(item).toMatchObject({
      sourceType: "MERCADOLIBRE",
      externalId: "MLA1234567890",
      externalKind: "ITEM",
      sourceUrl: "https://articulo.mercadolibre.com.ar/MLA-1234567890",
      title: "Cafetera Express",
      priceMinor: 18_999_999n,
      targetAmountMinor: 18_999_999n,
      availability: "AVAILABLE",
    });
    expect(item.sourceSnapshot).toMatchObject({
      title: "Cafetera Express",
      priceMinor: "18999999",
    });
  });

  it("resolves meli.la short links", async () => {
    const { ref } = await setup();
    const item = await importListItem(deps(), ref, { url: "https://meli.la/cafetera" });
    expect(item.externalId).toBe("MLA1000000001");
  });

  it("rejects unsafe links and redirects without calling the API", async () => {
    const { ref } = await setup();
    vi.mocked(gateway.fetchSnapshot).mockClear();
    for (const url of [
      "http://articulo.mercadolibre.com.ar/MLA-1234567890",
      "https://mercadolibre.com.ar.evil.com/MLA-1234567890",
      "https://127.0.0.1/MLA-1234567890",
      "https://meli.la/evil",
    ]) {
      expect((await errorOf(importListItem(deps(), ref, { url }))).code).toBe("UNSUPPORTED_URL");
    }
    expect(gateway.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("maps provider failures to user-facing errors", async () => {
    const { ref } = await setup();
    const missing = await errorOf(
      importListItem(deps(), ref, { url: "https://articulo.mercadolibre.com.ar/MLA-1999999999-x" }),
    );
    expect(missing.code).toBe("NOT_FOUND");

    const limited = await errorOf(
      importListItem(deps(), ref, { url: "https://articulo.mercadolibre.com.ar/MLA-1429429429-x" }),
    );
    expect(limited.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(limited.extra.retryAfterSeconds).toBe(12);

    const forbidden = await errorOf(
      importListItem(deps(), ref, { url: "https://articulo.mercadolibre.com.ar/MLA-1403403403-x" }),
    );
    expect(forbidden.code).toBe("SOURCE_FORBIDDEN");
    expect(forbidden.extra.fields?.url).toMatch(/Guardar en QuieroEso/);

    const userProduct = await errorOf(
      importListItem(deps(), ref, {
        url: "https://www.mercadolibre.com.ar/aplique/up/MLAU3914430684",
      }),
    );
    expect(userProduct.code).toBe("SOURCE_FORBIDDEN");
  });

  it("refuses duplicates in the same list", async () => {
    const { ref } = await setup();
    const url = "https://articulo.mercadolibre.com.ar/MLA-1234567890-x";
    await importListItem(deps(), ref, { url });
    expect((await errorOf(importListItem(deps(), ref, { url }))).code).toBe("CONFLICT");
  });

  it("owner edits keep the source snapshot and can be reverted", async () => {
    const { ref } = await setup();
    const item = await importListItem(deps(), ref, {
      url: "https://articulo.mercadolibre.com.ar/MLA-1234567890-x",
    });
    const edited = await updateItem(
      ctx.db,
      { ...ref, itemId: item.id },
      { title: "La cafetera de mis sueños", imageUrl: null, targetAmountMinor: 20_000_000n },
    );
    expect(edited.title).toBe("La cafetera de mis sueños");
    expect(edited.sourceSnapshot).toMatchObject({ title: "Cafetera Express" });

    const reverted = await updateItem(ctx.db, { ...ref, itemId: item.id }, { resetToSource: true });
    expect(reverted.title).toBe("Cafetera Express");
    expect(reverted.imageUrl).toBe("https://http2.mlstatic.com/D_1-O.jpg");
    expect(reverted.targetAmountMinor).toBe(20_000_000n);
  });
});
