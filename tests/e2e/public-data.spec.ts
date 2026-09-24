import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAsNewUser } from "./support/helpers";

test("public data exposes only PUBLIC lists and is accessible", async ({ page, browser, baseURL }) => {
  await signInAsNewUser(page);
  const headers = { Origin: new URL(baseURL!).origin };
  const make = async (title: string, visibility: "PUBLIC" | "UNLISTED") => {
    const { list } = await (await page.request.post("/api/lists", { data: { title }, headers })).json();
    await page.request.post(`/api/lists/${list.id}/items/import`, {
      data: { url: "https://meli.la/cafetera" },
      headers,
    });
    const published = await (
      await page.request.post(`/api/lists/${list.id}/publish`, { data: { visibility }, headers })
    ).json();
    return { slug: list.slug as string, shareUrl: published.shareUrl as string | null };
  };
  const pub = await make("Lista abierta", "PUBLIC");
  const secret = await make("Lista secreta", "UNLISTED");
  const token = new URL(secret.shareUrl!).pathname.split("/").pop()!;

  const anonymous = await browser.newContext();
  const request = anonymous.request;

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/l/${pub.slug}`);
  expect(sitemap).not.toContain(secret.slug);
  expect(sitemap).not.toContain(token);

  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toContain(`/l/${pub.slug}`);
  expect(llms).not.toContain(secret.slug);
  expect(llms).not.toContain(token);

  const api = await request.get(`/api/public/lists/${pub.slug}`);
  expect(api.status()).toBe(200);
  const json = await api.json();
  expect(json).toMatchObject({ slug: pub.slug, title: "Lista abierta" });
  expect(JSON.stringify(json)).not.toMatch(/ownerId|@example\.com|shareToken/);
  const etag = api.headers()["etag"]!;
  expect((await request.get(`/api/public/lists/${pub.slug}`, { headers: { "If-None-Match": etag } })).status()).toBe(304);
  expect((await request.get(`/api/public/lists/${secret.slug}`)).status()).toBe(404);

  const og = await request.get(`/l/${pub.slug}/opengraph-image`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");

  const openapi = await (await request.get("/openapi.json")).json();
  expect(openapi.openapi).toBe("3.1.0");
  expect(JSON.stringify(openapi)).not.toMatch(/secret-|mock-|localhost:4010/);

  const visitor = await anonymous.newPage();
  await visitor.goto(`/l/${pub.slug}`);
  const jsonLd = JSON.parse((await visitor.locator('script[type="application/ld+json"]').textContent())!);
  expect(jsonLd["@type"]).toBe("ItemList");
  expect(jsonLd.itemListElement[0].item["@type"]).toBe("Product");
  await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);

  for (const path of ["/", "/login", `/l/${pub.slug}`, secret.shareUrl!]) {
    await visitor.goto(path);
    const results = await new AxeBuilder({ page: visitor }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((violation) => `${path}: ${violation.id}`)).toEqual([]);
  }

  const editor = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(editor.violations.map((violation) => violation.id)).toEqual([]);
  await anonymous.close();
});
