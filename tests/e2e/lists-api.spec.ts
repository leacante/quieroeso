import { expect, test, type APIRequestContext } from "@playwright/test";
import { signInAsNewUser } from "./support/helpers";

function api(request: APIRequestContext, baseURL: string) {
  const headers = { Origin: new URL(baseURL).origin };
  return {
    get: (path: string) => request.get(path),
    post: (path: string, data?: unknown) => request.post(path, { data, headers }),
    patch: (path: string, data: unknown) => request.patch(path, { data, headers }),
    delete: (path: string) => request.delete(path, { headers }),
  };
}

test("owner manages a list through the API; other users get 404", async ({ browser, baseURL }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signInAsNewUser(ownerPage);
  const owner = api(ownerPage.request, baseURL!);

  const created = await owner.post("/api/lists", { title: "Cumple de prueba" });
  expect(created.status()).toBe(201);
  const { list } = await created.json();
  expect(list).not.toHaveProperty("shareTokenHash");

  for (let index = 0; index < 9; index++) {
    const item = await owner.post(`/api/lists/${list.id}/items`, {
      title: `Producto ${index + 1}`,
      priceMinor: "150000",
    });
    expect(item.status()).toBe(201);
  }

  const published = await owner.post(`/api/lists/${list.id}/publish`, { visibility: "UNLISTED" });
  expect(published.status()).toBe(200);
  const publishBody = await published.json();
  expect(publishBody.shareUrl).toMatch(/\/s\/[\w-]{43}$/);
  expect(publishBody.promotion).toEqual({ isPromotional: true, freeSlotsAssigned: 8 });

  const detail = await (await owner.get(`/api/lists/${list.id}`)).json();
  expect(detail.list.items.map((item: { feeRateBps: number }) => item.feeRateBps)).toEqual([
    0, 0, 0, 0, 0, 0, 0, 0, 100,
  ]);
  expect(detail.list.items[0].priceMinor).toBe("150000");

  const link = await (await owner.get(`/api/lists/${list.id}/share-link`)).json();
  expect(link.shareUrl).toBe(publishBody.shareUrl);

  // Mutations without a same-site Origin are rejected.
  const noOrigin = await ownerPage.request.post("/api/lists", { data: { title: "CSRF" } });
  expect(noOrigin.status()).toBe(403);

  // Another user cannot see or change the list.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signInAsNewUser(otherPage);
  const other = api(otherPage.request, baseURL!);
  expect((await other.get(`/api/lists/${list.id}`)).status()).toBe(404);
  expect((await other.patch(`/api/lists/${list.id}`, { title: "x" })).status()).toBe(404);
  expect((await other.delete(`/api/lists/${list.id}`)).status()).toBe(404);

  const invalid = await owner.post("/api/lists", { title: "" });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).fields.title).toBeTruthy();

  await ownerContext.close();
  await otherContext.close();
});
