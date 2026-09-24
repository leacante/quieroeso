import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPreference, getPayment } from "./client";
import { MercadoPagoApiError } from "./http";
import { buildAuthorizationUrl, createPkcePair, exchangeAuthorizationCode, refreshAccessToken } from "./oauth";
import { buildSignatureManifest, parseSignatureHeader, verifyWebhookSignature } from "./webhook-signature";

function fakeFetch(handler: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request.clone());
    return handler(request);
  }) as typeof fetch;
  return { fn, calls };
}

const config = (fetchImpl: typeof fetch) => ({
  apiBaseUrl: "https://api.mercadopago.com",
  clientId: "app-id",
  clientSecret: "app-secret",
  fetch: fetchImpl,
});

describe("PKCE and authorization URL", () => {
  it("creates an S256 pair", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("builds the authorization URL with state and PKCE", () => {
    const url = new URL(
      buildAuthorizationUrl({
        authBaseUrl: "https://auth.mercadopago.com",
        clientId: "app-id",
        redirectUri: "https://quieroeso.app/api/integrations/mercadopago/callback",
        state: "state-123",
        codeChallenge: "challenge",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "app-id",
      response_type: "code",
      platform_id: "mp",
      state: "state-123",
      redirect_uri: "https://quieroeso.app/api/integrations/mercadopago/callback",
      code_challenge: "challenge",
      code_challenge_method: "S256",
    });
  });
});

describe("token exchange", () => {
  const tokenBody = {
    access_token: "APP_USR-access",
    token_type: "bearer",
    expires_in: 15_552_000,
    scope: "offline_access read write",
    user_id: 1001,
    refresh_token: "TG-refresh",
    public_key: "APP_USR-public",
    live_mode: false,
  };

  it("exchanges the code with the verifier and maps tokens", async () => {
    const api = fakeFetch(() => Response.json(tokenBody));
    const tokens = await exchangeAuthorizationCode(config(api.fn), {
      code: "TG-code",
      redirectUri: "https://quieroeso.app/cb",
      codeVerifier: "verifier",
    });
    expect(tokens).toMatchObject({
      accessToken: "APP_USR-access",
      refreshToken: "TG-refresh",
      mercadoPagoUserId: "1001",
      liveMode: false,
    });
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 179 * 24 * 3600_000);
    expect(await api.calls[0]!.json()).toMatchObject({
      grant_type: "authorization_code",
      code: "TG-code",
      code_verifier: "verifier",
      client_secret: "app-secret",
    });
  });

  it("refreshes tokens and maps invalid_grant", async () => {
    const ok = fakeFetch(() => Response.json(tokenBody));
    await expect(refreshAccessToken(config(ok.fn), "TG-old")).resolves.toMatchObject({
      refreshToken: "TG-refresh",
    });
    expect(await ok.calls[0]!.json()).toMatchObject({ grant_type: "refresh_token", refresh_token: "TG-old" });

    const revoked = fakeFetch(() => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(refreshAccessToken(config(revoked.fn), "TG-old")).rejects.toMatchObject({
      kind: "INVALID_GRANT",
    });
  });
});

describe("Checkout Pro API", () => {
  it("creates a single-item preference with idempotency key and optional fee", async () => {
    const api = fakeFetch(() =>
      Response.json({ id: "pref-1", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" }),
    );
    const input = {
      item: { id: "item_1", title: "Cafetera", unitPrice: 1000 },
      externalReference: "contribution_1",
      notificationUrl: "https://quieroeso.app/api/webhooks/mercadopago",
      backUrls: { success: "https://q/s", pending: "https://q/p", failure: "https://q/f" },
    };
    await createPreference(config(api.fn), "APP_USR-seller", input, "contribution_1");
    await createPreference(config(api.fn), "APP_USR-seller", { ...input, marketplaceFee: 10 }, "contribution_2");

    const [free, paid] = api.calls;
    expect(free!.headers.get("x-idempotency-key")).toBe("contribution_1");
    expect(free!.headers.get("authorization")).toBe("Bearer APP_USR-seller");
    const freeBody = (await free!.json()) as { items: unknown[]; external_reference: string };
    expect(freeBody.items).toHaveLength(1);
    expect(freeBody).not.toHaveProperty("marketplace_fee");
    expect(freeBody.external_reference).toBe("contribution_1");
    expect(((await paid!.json()) as { marketplace_fee: number }).marketplace_fee).toBe(10);
  });

  it("reads payments and rejects non-numeric ids", async () => {
    const api = fakeFetch(() =>
      Response.json({
        id: 90000001,
        status: "approved",
        transaction_amount: 1000,
        currency_id: "ARS",
        external_reference: "c1",
        collector_id: 1001,
      }),
    );
    await expect(getPayment(config(api.fn), "token", "90000001")).resolves.toMatchObject({
      id: "90000001",
      collector_id: "1001",
    });
    await expect(getPayment(config(api.fn), "token", "../../users/me")).rejects.toBeInstanceOf(
      MercadoPagoApiError,
    );
  });
});

describe("webhook signature", () => {
  const secret = "webhook-secret";
  const sign = (dataId: string, requestId: string, ts: string) =>
    `ts=${ts},v1=${createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex")}`;

  it("builds the documented manifest", () => {
    expect(buildSignatureManifest({ dataId: "ABC123", requestId: "req-1", ts: "1742505638683" })).toBe(
      "id:abc123;request-id:req-1;ts:1742505638683;",
    );
  });

  it("accepts valid signatures and rejects tampering", () => {
    const header = sign("90000001", "req-1", "1742505638683");
    const base = { signatureHeader: header, requestId: "req-1", dataId: "90000001", secret };
    expect(verifyWebhookSignature(base)).toBe(true);
    expect(verifyWebhookSignature({ ...base, dataId: "90000002" })).toBe(false);
    expect(verifyWebhookSignature({ ...base, requestId: "req-2" })).toBe(false);
    expect(verifyWebhookSignature({ ...base, secret: "other" })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signatureHeader: null })).toBe(false);
    expect(verifyWebhookSignature({ ...base, requestId: null })).toBe(false);
  });

  it("parses headers defensively", () => {
    expect(parseSignatureHeader(" v1=" + "a".repeat(64) + ", ts=1")).toEqual({ ts: "1", v1: "a".repeat(64) });
    expect(parseSignatureHeader("ts=abc,v1=zz")).toBeNull();
    expect(parseSignatureHeader("garbage")).toBeNull();
  });
});
