import { expect, test } from "@playwright/test";
import { connectMercadoPago, createFundableList } from "./support/flows";
import { signInAsNewUser } from "./support/helpers";

test("visitor starts a Checkout Pro payment without an account", async ({ page, browser }) => {
  await signInAsNewUser(page);
  await connectMercadoPago(page);
  const { url } = await createFundableList(page, {
    items: [{ title: "Bicicleta rodado 29", priceMinor: "45900000" }],
  });

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  const card = visitor.getByTestId("public-item").filter({ hasText: "Bicicleta rodado 29" });
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await card.getByRole("button", { name: "Aportar" }).click();

  const dialog = visitor.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Aportar para Bicicleta/ })).toBeVisible();

  // Validation: amount below the minimum and missing consent.
  await dialog.getByLabel("Monto del aporte").fill("500");
  await dialog.getByRole("button", { name: "Ir a pagar con Mercado Pago" }).click();
  await expect(dialog.getByText(/Ingresá un monto entre/)).toBeVisible();
  await dialog.getByLabel("Monto del aporte").fill("20000");
  await dialog.getByRole("button", { name: "Ir a pagar con Mercado Pago" }).click();
  await expect(dialog.getByText("Tenés que aceptar los términos para continuar.")).toBeVisible();

  // Fee disclosure: first published list, so 0%.
  await expect(dialog.getByText("Comisión de QuieroEso (0%)")).toBeVisible();
  await expect(dialog.getByText(/Mercado Pago puede aplicar sus propios cargos/)).toBeVisible();

  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Ir a pagar con Mercado Pago" }).click();
  await expect(visitor.getByTestId("mp-amount")).toContainText("20.000");
  await expect(visitor.getByText("sin comisión de plataforma")).toBeVisible();
});
