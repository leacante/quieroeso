import { expect, type Page } from "@playwright/test";

export const MOCK_URL = process.env.E2E_MOCK_URL ?? "http://localhost:4010";

export type TestUser = "ana" | "bruno" | "carla";

/** Signs in through the mock Google provider and lands on `returnTo`. */
export async function signIn(page: Page, user: TestUser = "ana", returnTo = "/dashboard/lists") {
  await page.goto(`/login?next=${encodeURIComponent(returnTo)}`);
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await page.getByTestId(`google-user-${user}`).click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo));
}

/** Signs in as a brand-new user so tests do not share lists or free-tier state. */
export async function signInAsNewUser(page: Page, returnTo = "/dashboard/lists") {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto(`/login?next=${encodeURIComponent(returnTo)}`);
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await page.getByLabel("Nombre").fill(`Prueba ${id}`);
  await page.getByLabel("Email").fill(`e2e-${id}@example.com`);
  await page.getByRole("button", { name: "Usar otra cuenta" }).click();
  await page.waitForURL((url) => url.pathname.startsWith(returnTo));
  await expect(page.getByTestId("current-user")).toBeAttached();
  return { name: `Prueba ${id}` };
}

export async function resetMocks() {
  await fetch(`${MOCK_URL}/_admin/reset`, { method: "POST" });
}
