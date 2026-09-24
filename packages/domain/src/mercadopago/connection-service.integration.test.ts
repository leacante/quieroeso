import { MercadoPagoApiError, type MercadoPagoTokens } from "@quieroeso/integrations/mercadopago";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../errors";
import { createTestUser, testVault, useTestDatabase } from "../testing/fixtures";
import {
  completeMercadoPagoAuthorization,
  disconnectMercadoPago,
  getActiveAccessToken,
  getConnectionStatus,
  startMercadoPagoAuthorization,
  type ConnectionDeps,
  type MercadoPagoOAuthGateway,
} from "./connection-service";

const ctx = useTestDatabase();

function tokens(overrides: Partial<MercadoPagoTokens> = {}): MercadoPagoTokens {
  return {
    accessToken: `APP_USR-${Math.random()}`,
    refreshToken: `TG-${Math.random()}`,
    expiresAt: new Date(Date.now() + 180 * 24 * 3600_000),
    mercadoPagoUserId: "1001",
    scope: "offline_access read write",
    liveMode: false,
    ...overrides,
  };
}

function deps(oauth: Partial<MercadoPagoOAuthGateway> = {}, now?: () => Date): ConnectionDeps {
  return {
    db: ctx.db,
    vault: testVault,
    oauth: {
      exchangeCode: vi.fn(async () => tokens()),
      refresh: vi.fn(async () => tokens()),
      ...oauth,
    },
    config: {
      authBaseUrl: "https://auth.mercadopago.com",
      clientId: "app",
      redirectUri: "https://quieroeso.app/api/integrations/mercadopago/callback",
    },
    now,
  };
}

function stateOf(url: string): string {
  return new URL(url).searchParams.get("state")!;
}

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).code;
}

describe("Mercado Pago OAuth", () => {
  it("connects with PKCE and stores only encrypted tokens", async () => {
    const user = await createTestUser(ctx.db);
    const exchanged = tokens({ accessToken: "APP_USR-secret-access", refreshToken: "TG-secret-refresh" });
    const d = deps({ exchangeCode: vi.fn(async () => exchanged) });
    const { authorizationUrl } = await startMercadoPagoAuthorization(d, user.id);
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    await completeMercadoPagoAuthorization(d, { userId: user.id, state: stateOf(authorizationUrl), code: "TG-code" });
    const call = vi.mocked(d.oauth.exchangeCode).mock.calls[0]![0];
    expect(call.codeVerifier).toMatch(/^[\w-]{43}$/);

    const row = await ctx.db.mercadoPagoConnection.findUniqueOrThrow({ where: { userId: user.id } });
    expect(JSON.stringify(row)).not.toContain("APP_USR-secret-access");
    expect(JSON.stringify(row)).not.toContain("TG-secret-refresh");
    expect(row).toMatchObject({ status: "ACTIVE", mercadoPagoUserId: "1001", keyVersion: 1 });
    expect(await getConnectionStatus(ctx.db, user.id)).toMatchObject({ status: "ACTIVE" });
    expect(await ctx.db.auditEvent.count({ where: { action: "mercadopago.connected" } })).toBe(1);
  });

  it("rejects reused, foreign and expired states", async () => {
    const user = await createTestUser(ctx.db);
    const other = await createTestUser(ctx.db);
    const d = deps();

    const first = stateOf((await startMercadoPagoAuthorization(d, user.id)).authorizationUrl);
    await completeMercadoPagoAuthorization(d, { userId: user.id, state: first, code: "c" });
    expect(await codeOf(completeMercadoPagoAuthorization(d, { userId: user.id, state: first, code: "c" }))).toBe(
      "INVALID_STATE",
    );

    const foreign = stateOf((await startMercadoPagoAuthorization(d, user.id)).authorizationUrl);
    expect(await codeOf(completeMercadoPagoAuthorization(d, { userId: other.id, state: foreign, code: "c" }))).toBe(
      "INVALID_STATE",
    );

    const old = stateOf((await startMercadoPagoAuthorization(d, user.id)).authorizationUrl);
    const later = deps({}, () => new Date(Date.now() + 11 * 60_000));
    expect(await codeOf(completeMercadoPagoAuthorization(later, { userId: user.id, state: old, code: "c" }))).toBe(
      "INVALID_STATE",
    );
  });

  it("refuses an account already connected to another user", async () => {
    const a = await createTestUser(ctx.db);
    const b = await createTestUser(ctx.db);
    const d = deps();
    await completeMercadoPagoAuthorization(d, {
      userId: a.id,
      state: stateOf((await startMercadoPagoAuthorization(d, a.id)).authorizationUrl),
      code: "c",
    });
    expect(
      await codeOf(
        completeMercadoPagoAuthorization(d, {
          userId: b.id,
          state: stateOf((await startMercadoPagoAuthorization(d, b.id)).authorizationUrl),
          code: "c",
        }),
      ),
    ).toBe("CONFLICT");

    // Once disconnected, the same Mercado Pago account can be connected elsewhere.
    await disconnectMercadoPago(ctx.db, a.id);
    await completeMercadoPagoAuthorization(d, {
      userId: b.id,
      state: stateOf((await startMercadoPagoAuthorization(d, b.id)).authorizationUrl),
      code: "c",
    });
    expect(await getConnectionStatus(ctx.db, b.id)).toMatchObject({ status: "ACTIVE" });
  });
});

describe("access token refresh", () => {
  async function connectExpiringSoon(userId: string) {
    const d = deps({ exchangeCode: vi.fn(async () => tokens({ expiresAt: new Date(Date.now() + 3600_000) })) });
    await completeMercadoPagoAuthorization(d, {
      userId,
      state: stateOf((await startMercadoPagoAuthorization(d, userId)).authorizationUrl),
      code: "c",
    });
  }

  it("refreshes once under concurrency", async () => {
    const user = await createTestUser(ctx.db);
    await connectExpiringSoon(user.id);
    const refresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return tokens({ accessToken: "APP_USR-new" });
    });
    const d = deps({ refresh });
    const results = await Promise.all(Array.from({ length: 5 }, () => getActiveAccessToken(d, user.id)));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.accessToken === "APP_USR-new")).toBe(true);
  });

  it("marks the connection revoked on invalid_grant", async () => {
    const user = await createTestUser(ctx.db);
    await connectExpiringSoon(user.id);
    const d = deps({ refresh: vi.fn(async () => Promise.reject(new MercadoPagoApiError("INVALID_GRANT", 400))) });
    expect(await codeOf(getActiveAccessToken(d, user.id))).toBe("MERCADOPAGO_NOT_CONNECTED");
    expect(await getConnectionStatus(ctx.db, user.id)).toMatchObject({ status: "REVOKED" });
  });

  it("disconnecting wipes tokens", async () => {
    const user = await createTestUser(ctx.db);
    await connectExpiringSoon(user.id);
    await disconnectMercadoPago(ctx.db, user.id);
    const row = await ctx.db.mercadoPagoConnection.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ status: "DISCONNECTED", encryptedAccessToken: "", encryptedRefreshToken: "" });
    expect(await codeOf(getActiveAccessToken(deps(), user.id))).toBe("MERCADOPAGO_NOT_CONNECTED");
  });
});
