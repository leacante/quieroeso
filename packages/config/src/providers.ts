import type { AppEnvironment } from "./env";

/** Credentials accepted by apps/mock-providers. Only used when MOCK_PROVIDERS=true. */
export const MOCK_PROVIDER_CREDENTIALS = {
  meli: { clientId: "mock-meli-client", clientSecret: "mock-meli-secret" },
  mp: {
    clientId: "mock-mp-client",
    clientSecret: "mock-mp-secret",
    webhookSecret: "mock-mp-webhook-secret",
  },
} as const;

export type MercadoLibreSettings = {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Base URL of the mock short-link resolver, when mocks are enabled. */
  mockShortLinkBaseUrl: string | null;
};

export function mercadoLibreSettings(env: AppEnvironment): MercadoLibreSettings {
  if (env.MOCK_PROVIDERS) {
    return {
      apiBaseUrl: `${env.MOCK_PROVIDERS_INTERNAL_URL}/meli`,
      ...MOCK_PROVIDER_CREDENTIALS.meli,
      mockShortLinkBaseUrl: env.MOCK_PROVIDERS_INTERNAL_URL ?? null,
    };
  }
  return {
    apiBaseUrl: env.MELI_API_BASE_URL,
    clientId: env.MELI_CLIENT_ID ?? "",
    clientSecret: env.MELI_CLIENT_SECRET ?? "",
    mockShortLinkBaseUrl: null,
  };
}

export type MercadoPagoSettings = {
  authBaseUrl: string;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  redirectUri: string;
  notificationUrl: string;
  checkoutHosts: string[];
};

export function mercadoPagoSettings(env: AppEnvironment): MercadoPagoSettings {
  const shared = {
    redirectUri: new URL("/api/integrations/mercadopago/callback", env.APP_URL).toString(),
    notificationUrl: new URL("/api/webhooks/mercadopago", env.APP_URL).toString(),
  };
  if (env.MOCK_PROVIDERS) {
    return {
      ...shared,
      authBaseUrl: `${env.MOCK_PROVIDERS_PUBLIC_URL}/mp`,
      apiBaseUrl: `${env.MOCK_PROVIDERS_INTERNAL_URL}/mp`,
      ...MOCK_PROVIDER_CREDENTIALS.mp,
      checkoutHosts: [new URL(env.MOCK_PROVIDERS_PUBLIC_URL ?? "http://localhost").host],
    };
  }
  return {
    ...shared,
    authBaseUrl: env.MP_AUTH_BASE_URL,
    apiBaseUrl: env.MP_API_BASE_URL,
    clientId: env.MP_CLIENT_ID ?? "",
    clientSecret: env.MP_CLIENT_SECRET ?? "",
    webhookSecret: env.MP_WEBHOOK_SECRET ?? "",
    checkoutHosts: env.MP_CHECKOUT_HOSTS,
  };
}
