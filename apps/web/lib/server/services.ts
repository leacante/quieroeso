import "server-only";

import { getPrisma } from "@quieroeso/db";
import type { ListDeps } from "@quieroeso/domain";
import { createTokenVault, type TokenVault } from "@quieroeso/integrations/crypto";
import { getEnv } from "./env";

let vault: TokenVault | undefined;

export function getTokenVault(): TokenVault {
  const env = getEnv();
  vault ??= createTokenVault(env.tokenEncryptionKeys, env.ACTIVE_TOKEN_KEY_VERSION);
  return vault;
}

export function getListDeps(): ListDeps {
  return { db: getPrisma(), vault: getTokenVault() };
}
