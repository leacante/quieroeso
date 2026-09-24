import { expect, test } from "@playwright/test";
import { connectMercadoPago, contribute, createFundableList } from "./support/flows";
import { MOCK_URL, signInAsNewUser } from "./support/helpers";

const adminPost = (path: string, data: unknown) =>
  fetch(`${MOCK_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

test.describe("MVP acceptance journey", () => {
  test.afterEach(async () => {
    await adminPost("/_admin/meli/outage", { enabled: false });
    await adminPost("/_admin/mp/outage", { enabled: false });
  });

  test("owner builds, imports and publishes; visitors see public and unlisted lists", async ({
    page,
    browser,
  }) => {
    await signInAsNewUser(page);

    await page.getByLabel("Nombre de la nueva lista").fill("Casamiento de Ana y Bruno");
    await page.getByRole("button", { name: "Crear lista" }).click();
    await page.waitForURL(/\/dashboard\/lists\/.+/);
    await expect(
      page.getByText(/Tu primera lista publicada tiene 8 productos sin comisión/),
    ).toBeVisible();

    await page.getByLabel("Enlace del producto").fill("https://meli.la/cafetera");
    await page.getByRole("button", { name: "Agregar producto" }).click();
    await expect(page.getByTestId("editor-item")).toHaveCount(1);
    const item = page.getByTestId("editor-item").first();
    await expect(item).toContainText("Cafetera Express Oster 15 Bares Acero");
    await expect(item).toContainText("$ 189.999,99");
    // Decorative thumbnail (alt=""): the product title sits next to it.
    await expect(item.locator("img")).toHaveAttribute("src", /meli\/img\/MLA1000000001/);
    await expect(item.getByTestId("fee-badge")).toHaveText("Sin comisión");

    await page.getByRole("radio", { name: /Pública/ }).check();
    await page.getByRole("button", { name: "Publicar lista" }).click();
    await expect(
      page.getByText("¡Lista publicada! 1 productos quedaron sin comisión."),
    ).toBeVisible();
    const publicUrl = await page.getByTestId("share-link").inputValue();
    expect(publicUrl).toMatch(/\/l\/casamiento-de-ana-y-bruno-/);

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(publicUrl);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
      "Casamiento de Ana y Bruno",
    );
    await expect(visitor.getByRole("link", { name: /Ver en Mercado Libre/ })).toHaveAttribute(
      "href",
      "https://articulo.mercadolibre.com.ar/MLA-1000000001",
    );

    // Switch to unlisted: the public URL disappears and only the token works.
    await page.getByRole("radio", { name: /Con enlace/ }).check();
    await page.getByRole("button", { name: "Guardar visibilidad" }).click();
    await expect(page.getByTestId("share-link")).toHaveValue(/\/s\/[\w-]{43}$/);
    const secretUrl = await page.getByTestId("share-link").inputValue();

    expect((await visitor.goto(publicUrl))?.status()).toBe(404);
    expect((await visitor.goto(secretUrl))?.status()).toBe(200);
    expect((await visitor.goto(`${secretUrl.slice(0, -3)}xyz`))?.status()).toBe(404);
    const sitemap = await (await visitor.request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain(new URL(secretUrl).pathname);
    expect(sitemap).not.toContain(new URL(publicUrl).pathname);
  });

  test("first list: eight products at 0% and the ninth at 1%; later lists start at 1%", async ({
    page,
  }) => {
    await signInAsNewUser(page);
    const first = await createFundableList(page, {
      title: "Primera",
      perItem: false,
      items: Array.from({ length: 9 }, (_, index) => ({
        title: `Producto ${index + 1}`,
        priceMinor: "150000",
      })),
    });
    await page.goto(`/dashboard/lists/${first.list.id}`);
    const badges = page.getByTestId("fee-badge");
    await expect(badges).toHaveCount(9);
    for (let index = 0; index < 8; index++)
      await expect(badges.nth(index)).toHaveText("Sin comisión");
    await expect(badges.nth(8)).toHaveText("Comisión 1%");

    const second = await createFundableList(page, {
      title: "Segunda",
      perItem: false,
      items: [{ title: "Primer producto de la segunda", priceMinor: "150000" }],
    });
    await page.goto(`/dashboard/lists/${second.list.id}`);
    await expect(page.getByTestId("fee-badge")).toHaveText("Comisión 1%");
    await expect(page.getByText(/comisión de plataforma del 1%/)).toBeVisible();
  });

  test("provider outages fail safely without corrupting data", async ({ page, browser }) => {
    await signInAsNewUser(page);
    await connectMercadoPago(page);
    const { list, url } = await createFundableList(page, {
      items: [{ title: "Parlante", priceMinor: "16999900" }],
    });
    const headers = { Origin: new URL(page.url()).origin };

    // Mercado Libre down: import fails with 503 and nothing is stored.
    await adminPost("/_admin/meli/outage", { enabled: true });
    const failedImport = await page.request.post(`/api/lists/${list.id}/items/import`, {
      data: { url: "https://articulo.mercadolibre.com.ar/MLA-1000000006-kindle-_JM" },
      headers,
    });
    expect(failedImport.status()).toBe(503);
    expect(failedImport.headers()["retry-after"]).toBeTruthy();
    const detail = await (await page.request.get(`/api/lists/${list.id}`)).json();
    expect(detail.list.items).toHaveLength(1);
    await adminPost("/_admin/meli/outage", { enabled: false });

    // Mercado Pago down: checkout fails, no money moves, and the visitor can retry later.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url);
    await adminPost("/_admin/mp/outage", { enabled: true });
    const card = visitor.getByTestId("public-item").filter({ hasText: "Parlante" });
    await card.getByRole("button", { name: "Aportar" }).click();
    const dialog = visitor.getByRole("dialog");
    await dialog.getByLabel("Monto del aporte").fill("30000");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Ir a pagar con Mercado Pago" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/Mercado Pago no responde/);
    await adminPost("/_admin/mp/outage", { enabled: false });

    await dialog.getByRole("button", { name: "Ir a pagar con Mercado Pago" }).click();
    await visitor.getByTestId("mp-pay-approved").click();
    await expect(visitor.getByRole("heading", { name: "¡Gracias por tu aporte!" })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/dashboard/contributions");
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId("total-amount")).toHaveText("$ 30.000");
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("contribution-row")).toHaveCount(1);
  });

  test("contributions on a second list pay the 1% platform fee", async ({ page, browser }) => {
    await signInAsNewUser(page);
    await connectMercadoPago(page);
    await createFundableList(page, {
      title: "Promo",
      items: [{ title: "Gratis", priceMinor: "150000" }],
    });
    const { url } = await createFundableList(page, {
      title: "Estándar",
      items: [{ title: "Con comisión", priceMinor: "1000000" }],
    });
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url);
    await contribute(visitor, "Con comisión", "5000");
    await expect(visitor.getByRole("heading", { name: "¡Gracias por tu aporte!" })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/dashboard/contributions");
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId("total-fees")).toHaveText("$ 50");
    }).toPass({ timeout: 15_000 });
  });
});
