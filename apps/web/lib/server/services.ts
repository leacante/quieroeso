import "server-only";

import { getPrisma } from "@quieroeso/db";
import type { ImportDeps, ListDeps } from "@quieroeso/domain";
import { createTokenVault, type TokenVault } from "@quieroeso/integrations/crypto";
import {
  createMercadoLibreClient,
  createMockHopFetcher,
  guardedHopFetcher,
  type MercadoLibreGateway,
} from "@quieroeso/integrations/mercadolibre";
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
