import { expect, test, type Page } from "@playwright/test";
import { signInAsNewUser } from "./support/helpers";

async function createPublishedList(
  page: Page,
  baseURL: string,
  visibility: "PUBLIC" | "UNLISTED" | null,
) {
  const headers = { Origin: new URL(baseURL).origin };
  const { list } = await (
    await page.request.post("/api/lists", { data: { title: `Visibilidad ${visibility}` }, headers })
  ).json();
  await page.request.post(`/api/lists/${list.id}/items`, {
    data: { title: "Taza de cerámica", priceMinor: "250000" },
    headers,
  });
  if (!visibility) return { list, shareUrl: null as string | null };
  const published = await (
    await page.request.post(`/api/lists/${list.id}/publish`, { data: { visibility }, headers })
  ).json();
  return { list, shareUrl: published.shareUrl as string | null };
}

test.describe("list visibility", () => {
  test("public, unlisted and private lists are reachable only as intended", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signInAsNewUser(page);
    const publicList = await createPublishedList(page, baseURL!, "PUBLIC");
    const unlisted = await createPublishedList(page, baseURL!, "UNLISTED");
    const privateList = await createPublishedList(page, baseURL!, null);

    const visitor = await (await browser.newContext()).newPage();

    // PUBLIC by slug, indexable, with canonical URL.
    const publicResponse = await visitor.goto(`/l/${publicList.list.slug}`);
    expect(publicResponse?.status()).toBe(200);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(publicList.list.title);
    await expect(visitor.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/l/${publicList.list.slug}$`),
    );

    // UNLISTED by secret token only; noindex, no canonical, no-referrer.
    const unlistedResponse = await visitor.goto(unlisted.shareUrl!);
    expect(unlistedResponse?.status()).toBe(200);
    expect(unlistedResponse?.headers()["x-robots-tag"]).toContain("noindex");
    expect(unlistedResponse?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex, nofollow/,
    );
    await expect(visitor.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(visitor.getByText("Taza de cerámica")).toBeVisible();

    // Uniform 404 for everything else.
    const wrongToken = unlisted.shareUrl!.replace(/.{4}$/, "AAAA");
    for (const path of [
      `/l/${unlisted.list.slug}`,
      `/l/${privateList.list.slug}`,
      `/l/no-existe-123456`,
      new URL(wrongToken).pathname,
      "/s/corto",
    ]) {
      const response = await visitor.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(
        visitor.getByRole("heading", { name: "No encontramos esta página" }),
      ).toBeVisible();
    }

    // Making the list private revokes the secret link.
    await page.request.patch(`/api/lists/${unlisted.list.id}`, {
      data: { visibility: "PRIVATE" },
      headers: { Origin: new URL(baseURL!).origin },
    });
    expect((await visitor.goto(unlisted.shareUrl!))?.status()).toBe(404);
  });
});
