import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { connectMercadoPago, contribute, createFundableList } from "./support/flows";
import { MOCK_URL, signInAsNewUser } from "./support/helpers";

/** Webhooks are processed after the 200 response, so state converges shortly after. */
async function eventually(page: Page, assertion: () => Promise<void>) {
  await expect(async () => {
    await page.reload();
    await assertion();
  }).toPass({ timeout: 15_000, intervals: [250, 500, 1_000] });
}

type MockPayment = { id: number; status: string; external_reference: string; transaction_amount: number };

async function paymentsFor(request: APIRequestContext, contributionId: string): Promise<MockPayment[]> {
  const all = (await (await request.get(`${MOCK_URL}/_admin/mp/payments`)).json()) as MockPayment[];
  return all.filter((payment) => payment.external_reference === contributionId);
}

test.describe("Mercado Pago webhooks", () => {
  test("approved, duplicated, refunded and charged-back payments update history exactly once", async ({
    page,
    browser,
    request,
  }) => {
    await signInAsNewUser(page);
    await connectMercadoPago(page);
    const { url } = await createFundableList(page, {
      items: [
        { title: "Cafetera", priceMinor: "18999999" },
        { title: "Auriculares", priceMinor: "7499900" },
      ],
    });

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url);
    await contribute(visitor, "Cafetera", "50000");
    await expect(visitor.getByRole("heading", { name: "¡Gracias por tu aporte!" })).toBeVisible({ timeout: 20_000 });
    const contributionId = new URL(visitor.url()).searchParams.get("contribution")!;

    // Progress reflects only approved money.
    await visitor.goto(url);
    const cafetera = visitor.getByTestId("public-item").filter({ hasText: "Cafetera" });
    await expect(cafetera.getByText("$ 50.000")).toBeVisible();

    // Mercado Pago retries the same notification several times: credited once.
    const [payment] = await paymentsFor(request, contributionId);
    const resend = await request.post(`${MOCK_URL}/_admin/mp/payments/${payment!.id}/resend`, {
      data: { times: 3 },
    });
    expect((await resend.json()).webhookStatuses).toEqual([200, 200, 200]);

    await page.goto("/dashboard/contributions");
    await eventually(page, () => expect(page.getByTestId("contribution-row")).toHaveCount(1));
    await expect(page.getByTestId("total-amount")).toHaveText("$ 50.000");
    await expect(page.getByTestId("total-fees")).toHaveText("$ 0");
    await expect(page.getByText("Tía Marta")).toBeVisible();

    // A rejected attempt on another product is recorded but never credited.
    await visitor.goto(url);
    await contribute(visitor, "Auriculares", "10000", "rejected");
    await expect(visitor.getByRole("heading", { name: "El pago no se completó" })).toBeVisible({ timeout: 20_000 });

    // Refund issued from Mercado Pago.
    await request.post(`${MOCK_URL}/_admin/mp/payments/${payment!.id}/status`, { data: { status: "refunded" } });
    await eventually(page, () =>
      expect(page.getByTestId("contribution-row").filter({ hasText: "Cafetera" })).toContainText("Reembolsado"),
    );
    await expect(page.getByTestId("total-amount")).toHaveText("$ 0");

    // Chargeback on a fresh approved payment.
    await visitor.goto(url);
    await contribute(visitor, "Auriculares", "20000");
    await expect(visitor.getByRole("heading", { name: "¡Gracias por tu aporte!" })).toBeVisible({ timeout: 20_000 });
    const secondId = new URL(visitor.url()).searchParams.get("contribution")!;
    const [second] = await paymentsFor(request, secondId);
    await request.post(`${MOCK_URL}/_admin/mp/payments/${second!.id}/status`, { data: { status: "charged_back" } });
    await eventually(page, () =>
      expect(page.getByTestId("contribution-row").filter({ hasText: "Auriculares" }).first()).toContainText(
        "Contracargo",
      ),
    );
  });

  test("rejects notifications with an invalid signature", async ({ request }) => {
    const response = await request.post("/api/webhooks/mercadopago?data.id=123&type=payment", {
      data: { id: 1, type: "payment", data: { id: "123" }, user_id: 1001 },
      headers: { "x-signature": `ts=1,v1=${"0".repeat(64)}`, "x-request-id": "req-1" },
    });
    expect(response.status()).toBe(401);

    const unsigned = await request.post("/api/webhooks/mercadopago?data.id=123&type=payment", {
      data: { id: 2 },
    });
    expect(unsigned.status()).toBe(401);
  });
});
