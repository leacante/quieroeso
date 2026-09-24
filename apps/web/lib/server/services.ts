import "server-only";

import { getPrisma } from "@quieroeso/db";
import {
  getActiveAccessToken,
  type ConnectionDeps,
  type ContributionDeps,
  type ImportDeps,
  type ListDeps,
} from "@quieroeso/domain";
import { createTokenVault, type TokenVault } from "@quieroeso/integrations/crypto";
import {
  createMercadoLibreClient,
  createMockHopFetcher,
  guardedHopFetcher,
  type MercadoLibreGateway,
} from "@quieroeso/integrations/mercadolibre";
import {
  createPreference,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@quieroeso/integrations/mercadopago";
import { getEnv } from "./env";

/** Credentials accepted by apps/mock-providers. Only used when MOCK_PROVIDERS=true. */
export const MOCK_CREDENTIALS = {
  meli: { clientId: "mock-meli-client", clientSecret: "mock-meli-secret" },
  mp: {
    clientId: "mock-mp-client",
    clientSecret: "mock-mp-secret",
    webhookSecret: "mock-mp-webhook-secret",
  },
} as const;

let vault: TokenVault | undefined;
let meli: MercadoLibreGateway | undefined;

export function getTokenVault(): TokenVault {
  const env = getEnv();
  vault ??= createTokenVault(env.tokenEncryptionKeys, env.ACTIVE_TOKEN_KEY_VERSION);
  return vault;
}

export function getListDeps(): ListDeps {
  return { db: getPrisma(), vault: getTokenVault() };
}

export function getMercadoLibreGateway(): MercadoLibreGateway {
  const env = getEnv();
  meli ??= env.MOCK_PROVIDERS
    ? createMercadoLibreClient({
        baseUrl: `${env.MOCK_PROVIDERS_INTERNAL_URL}/meli`,
        ...MOCK_CREDENTIALS.meli,
      })
    : createMercadoLibreClient({
        baseUrl: env.MELI_API_BASE_URL,
        clientId: env.MELI_CLIENT_ID ?? "",
        clientSecret: env.MELI_CLIENT_SECRET ?? "",
      });
  return meli;
}

export function getImportDeps(): ImportDeps {
  const env = getEnv();
  return {
    db: getPrisma(),
    meli: getMercadoLibreGateway(),
    fetchHop:
      env.MOCK_PROVIDERS && env.MOCK_PROVIDERS_INTERNAL_URL
        ? createMockHopFetcher(env.MOCK_PROVIDERS_INTERNAL_URL)
        : guardedHopFetcher,
  };
}

/** Mercado Pago endpoints and credentials for the current environment. */
export function getMercadoPagoConfig() {
  const env = getEnv();
  const mock = env.MOCK_PROVIDERS;
  return {
    authBaseUrl: mock ? `${env.MOCK_PROVIDERS_PUBLIC_URL}/mp` : env.MP_AUTH_BASE_URL,
    apiBaseUrl: mock ? `${env.MOCK_PROVIDERS_INTERNAL_URL}/mp` : env.MP_API_BASE_URL,
    clientId: mock ? MOCK_CREDENTIALS.mp.clientId : (env.MP_CLIENT_ID ?? ""),
    clientSecret: mock ? MOCK_CREDENTIALS.mp.clientSecret : (env.MP_CLIENT_SECRET ?? ""),
    webhookSecret: mock ? MOCK_CREDENTIALS.mp.webhookSecret : (env.MP_WEBHOOK_SECRET ?? ""),
    redirectUri: new URL("/api/integrations/mercadopago/callback", env.APP_URL).toString(),
    notificationUrl: new URL("/api/webhooks/mercadopago", env.APP_URL).toString(),
    checkoutHosts: mock
      ? [new URL(env.MOCK_PROVIDERS_PUBLIC_URL ?? "http://localhost").host]
      : env.MP_CHECKOUT_HOSTS,
  };
}

export function getConnectionDeps(): ConnectionDeps {
  const config = getMercadoPagoConfig();
  const oauthConfig = {
    apiBaseUrl: config.apiBaseUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };
  return {
    db: getPrisma(),
    vault: getTokenVault(),
    oauth: {
      exchangeCode: (params) => exchangeAuthorizationCode(oauthConfig, params),
      refresh: (refreshToken) => refreshAccessToken(oauthConfig, refreshToken),
    },
    config: {
      authBaseUrl: config.authBaseUrl,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
    },
  };
}

export function getContributionDeps(): ContributionDeps {
  const env = getEnv();
  const mp = getMercadoPagoConfig();
  const connection = getConnectionDeps();
  return {
    db: getPrisma(),
    getOwnerAccessToken: (ownerId) => getActiveAccessToken(connection, ownerId),
    createPreference: (accessToken, input, key) =>
      createPreference({ apiBaseUrl: mp.apiBaseUrl }, accessToken, input, key),
    config: {
      minContributionMinor: env.MIN_CONTRIBUTION_MINOR,
      appUrl: env.APP_URL,
      notificationUrl: mp.notificationUrl,
      checkoutHosts: mp.checkoutHosts,
    },
  };
}
