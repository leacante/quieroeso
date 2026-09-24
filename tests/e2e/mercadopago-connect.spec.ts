import { expect, test } from "@playwright/test";
import { signInAsNewUser } from "./support/helpers";

test("connects Mercado Pago through OAuth and enables contributions", async ({ page }) => {
  await signInAsNewUser(page, "/dashboard/mercadopago");
  await expect(page.getByTestId("mp-status")).toHaveText("Sin conectar");

  // Cancelling the authorization leaves the account disconnected.
  await page.getByRole("button", { name: "Conectar Mercado Pago" }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Cancelaste la conexión")).toBeVisible();

  await page.getByRole("button", { name: "Conectar Mercado Pago" }).click();
  await page.getByTestId("mp-seller-new").click();
  await expect(page).toHaveURL(/status=connected/);
  await expect(page.getByTestId("mp-status")).toHaveText("Conectada");
  await expect(page.getByText(/APP_USR|TG-/)).toHaveCount(0);

  await page.goto("/dashboard/lists");
  await page.getByLabel("Nombre de la nueva lista").fill("Con aportes");
  await page.getByRole("button", { name: "Crear lista" }).click();
  await page.waitForURL(/\/dashboard\/lists\/.+/);
  await page.getByRole("button", { name: "Habilitar aportes" }).click();
  await expect(page.getByRole("heading", { name: "Recibís aportes por producto" })).toBeVisible();

  // Disconnecting wipes the connection.
  await page.goto("/dashboard/mercadopago");
  await page.getByRole("button", { name: "Desconectar" }).click();
  await page.getByRole("button", { name: "Sí, desconectar" }).click();
  await expect(page.getByTestId("mp-status")).toHaveText("Desconectada");
});
