import { expect, test } from "@playwright/test";
import { signInAsNewUser } from "./support/helpers";

/**
 * Walks the main screens on desktop (1440px) and mobile (360px), asserting there is
 * no horizontal overflow and saving screenshots under test-results/ for review.
 */
test("main screens render without horizontal overflow", async ({ page }, testInfo) => {
  const shot = async (name: string) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${name} overflows horizontally`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  };

  await page.goto("/");
  await shot("home");

  await signInAsNewUser(page);
  await shot("lists-empty");

  await page.getByLabel("Nombre de la nueva lista").fill("Mi cumple 30");
  await page.getByRole("button", { name: "Crear lista" }).click();
  await page.waitForURL(/\/dashboard\/lists\/.+/);

  for (const url of [
    "https://meli.la/cafetera",
    "https://articulo.mercadolibre.com.ar/MLA-1000000002-auriculares-_JM",
    "https://articulo.mercadolibre.com.ar/MLA-1000000011-lampara-_JM",
  ]) {
    await page.getByLabel("Enlace del producto").fill(url);
    await page.getByRole("button", { name: "Agregar producto" }).click();
    await expect(page.getByText(/Agregamos/)).toBeVisible();
  }
  await expect(page.getByTestId("editor-item")).toHaveCount(3);
  await shot("editor");

  await page.getByRole("radio", { name: /Pública/ }).check();
  await page.getByRole("button", { name: "Publicar lista" }).click();
  await expect(page.getByText(/Lista publicada/)).toBeVisible();
  const publicUrl = await page.getByTestId("share-link").inputValue();

  await page.goto(publicUrl);
  await expect(page.getByTestId("public-item")).toHaveCount(3);
  await shot("public-list");
});
