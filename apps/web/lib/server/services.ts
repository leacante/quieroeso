import "server-only";

import { getPrisma } from "@quieroeso/db";
import {
  getActiveAccessToken,
  type ConnectionDeps,
  type ContributionDeps,
  type ImportDeps,
  type ListDeps,
  type PaymentEventDeps,
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
  getPayment,
  refreshAccessToken,
} from "@quieroeso/integrations/mercadopago";
import {
  mercadoLibreSettings,
  mercadoPagoSettings,
  type MercadoPagoSettings,
} from "@quieroeso/config";
import { getEnv } from "./env";

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
  const settings = mercadoLibreSettings(getEnv());
  meli ??= createMercadoLibreClient({
    baseUrl: settings.apiBaseUrl,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
  });
  return meli;
}

export function getImportDeps(): ImportDeps {
  const settings = mercadoLibreSettings(getEnv());
  return {
    db: getPrisma(),
    meli: getMercadoLibreGateway(),
    fetchHop: settings.mockShortLinkBaseUrl
      ? createMockHopFetcher(settings.mockShortLinkBaseUrl)
      : guardedHopFetcher,
  };
}

/** Mercado Pago endpoints and credentials for the current environment. */
export function getMercadoPagoConfig(): MercadoPagoSettings {
  return mercadoPagoSettings(getEnv());
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

export function getPaymentEventDeps(): PaymentEventDeps {
  const db = getPrisma();
  const mp = getMercadoPagoConfig();
  const connection = getConnectionDeps();
  return {
    db,
    async getAccessTokenForCollector(collectorId) {
      const owner = await db.mercadoPagoConnection.findFirst({
        where: { mercadoPagoUserId: collectorId, status: "ACTIVE" },
        select: { userId: true },
      });
      if (!owner) return null;
      const { accessToken } = await getActiveAccessToken(connection, owner.userId);
      return { accessToken };
    },
    getPayment: (accessToken, paymentId) => getPayment({ apiBaseUrl: mp.apiBaseUrl }, accessToken, paymentId),
  };
}
