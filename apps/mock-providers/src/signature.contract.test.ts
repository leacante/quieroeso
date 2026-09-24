import { verifyWebhookSignature } from "@quieroeso/integrations/mercadopago";
import { describe, expect, it } from "vitest";
import { signNotification } from "./mercadopago";

/**
 * The mock signs notifications independently from the production verifier, so this
 * contract test catches drift between the two implementations of Mercado Pago's manifest.
 */
describe("mock webhook signatures", () => {
  it("are accepted by the production verifier", () => {
    const header = signNotification("90000001", "req-123", 1742505638683, "secret");
    expect(
      verifyWebhookSignature({
        signatureHeader: header,
        requestId: "req-123",
        dataId: "90000001",
        secret: "secret",
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        signatureHeader: header,
        requestId: "req-123",
        dataId: "90000002",
        secret: "secret",
      }),
    ).toBe(false);
  });
});
