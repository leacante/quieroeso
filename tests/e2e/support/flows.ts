import { expect, type Page } from "@playwright/test";

const origin = (page: Page) => ({ Origin: new URL(page.url()).origin });

/** Connects a fresh mock Mercado Pago seller account for the signed-in user. */
export async function connectMercadoPago(page: Page) {
  await page.goto("/dashboard/mercadopago");
  await page.getByRole("button", { name: "Conectar Mercado Pago" }).click();
  await page.getByTestId("mp-seller-new").click();
  await expect(page.getByTestId("mp-status")).toHaveText("Conectada");
}

/**
 * Creates a published list with manual items (price = target) through the API.
 * Returns the list and its shareable URL.
 */
export async function createFundableList(
  page: Page,
  options: { title?: string; items: { title: string; priceMinor: string }[]; visibility?: "PUBLIC" | "UNLISTED"; perItem?: boolean },
) {
  const headers = origin(page);
  const { list } = await (
    await page.request.post("/api/lists", { data: { title: options.title ?? "Lista con aportes" }, headers })
  ).json();
  const items: { id: string; feeRateBps: number }[] = [];
  for (const item of options.items) {
    const response = await page.request.post(`/api/lists/${list.id}/items`, { data: item, headers });
    items.push((await response.json()).item);
  }
  const published = await (
    await page.request.post(`/api/lists/${list.id}/publish`, {
      data: { visibility: options.visibility ?? "PUBLIC" },
      headers,
    })
  ).json();
  if (options.perItem !== false) {
    const mode = await page.request.patch(`/api/lists/${list.id}`, { data: { fundingMode: "PER_ITEM" }, headers });
    expect(mode.status()).toBe(200);
  }
  const url: string = published.shareUrl ?? published.list.publicUrl;
  return { list, items, url };
}

/** Opens the contribution dialog for an item on a shared page and pays in the mock checkout. */
export async function contribute(
  page: Page,
  itemTitle: string,
  amount: string,
  outcome: "approved" | "pending" | "rejected" = "approved",
) {
  const card = page.getByTestId("public-item").filter({ hasText: itemTitle });
  await card.getByRole("button", { name: "Aportar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Monto del aporte").fill(amount);
  await dialog.getByLabel("Tu nombre").fill("Tía Marta");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Ir a pagar con Mercado Pago" }).click();
  await page.getByTestId(`mp-pay-${outcome}`).click();
  await page.waitForURL(/\/aportes\/resultado/);
}
