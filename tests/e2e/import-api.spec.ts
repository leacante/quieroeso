import { expect, test } from "@playwright/test";
import { signInAsNewUser } from "./support/helpers";

test("imports Mercado Libre links through the mock API", async ({ page, baseURL }) => {
  await signInAsNewUser(page);
  const headers = { Origin: new URL(baseURL!).origin };
  const post = (path: string, data: unknown) => page.request.post(path, { data, headers });

  const { list } = await (await post("/api/lists", { title: "Importaciones" })).json();
  const importUrl = `/api/lists/${list.id}/items/import`;

  const listing = await post(importUrl, {
    url: "https://articulo.mercadolibre.com.ar/MLA-1000000002-auriculares-sony-_JM#position=1",
  });
  expect(listing.status()).toBe(201);
  expect((await listing.json()).item).toMatchObject({
    externalId: "MLA1000000002",
    title: "Auriculares Inalámbricos Sony WH-CH520 Azul",
    priceMinor: "7499900",
    availability: "AVAILABLE",
  });

  const short = await post(importUrl, { url: "https://meli.la/cafetera" });
  expect(short.status()).toBe(201);
  expect((await short.json()).item.externalId).toBe("MLA1000000001");

  const catalog = await post(importUrl, {
    url: "https://www.mercadolibre.com.ar/smart-tv-samsung-50/p/MLA20000002",
  });
  expect((await catalog.json()).item).toMatchObject({ priceMinor: "69999900" });

  const paused = await post(importUrl, {
    url: "https://articulo.mercadolibre.com.ar/MLA-1000000011-lampara-_JM",
  });
  expect((await paused.json()).item.availability).toBe("UNAVAILABLE");

  for (const url of ["https://meli.la/evil", "https://meli.la/loop", "http://169.254.169.254/"]) {
    const rejected = await post(importUrl, { url });
    expect(rejected.status(), url).toBe(422);
    expect((await rejected.json()).code).toBe("UNSUPPORTED_URL");
  }

  const missing = await post(importUrl, {
    url: "https://articulo.mercadolibre.com.ar/MLA-1999999999-no-existe-_JM",
  });
  expect(missing.status()).toBe(404);

  const duplicate = await post(importUrl, { url: "https://meli.la/cafetera" });
  expect(duplicate.status()).toBe(409);

  // 20 imports per user every 10 minutes: this user already made 11 attempts.
  let limited = null;
  for (let attempt = 0; attempt < 12 && !limited; attempt++) {
    const response = await post(importUrl, { url: "https://meli.la/cafetera" });
    if (response.status() === 429) limited = response;
  }
  expect(limited, "import rate limit not reached").not.toBeNull();
  expect(Number(limited!.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await limited!.json()).code).toBe("RATE_LIMITED");
});
