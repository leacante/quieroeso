import { expect, test } from "@playwright/test";
import { signIn } from "./support/helpers";

test.describe("Google sign-in (mock provider)", () => {
  test("redirects anonymous visitors from the dashboard to login", async ({ page }) => {
    await page.goto("/dashboard/lists");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Flists/);
    await expect(page.getByRole("heading", { name: "Entrá a QuieroEso" })).toBeVisible();
  });

  test("signs in with Google and signs out", async ({ page }) => {
    await signIn(page, "ana");
    await expect(page.getByRole("heading", { name: /Hola, Ana/ })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/dashboard/lists");
    await expect(page).toHaveURL(/\/login/);
  });

  test("API returns 401 problem without a session", async ({ request }) => {
    const response = await request.get("/api/lists");
    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/problem+json");
  });
});
