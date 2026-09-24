import { isUniqueViolation, type PrismaClient } from "@quieroeso/db";
import { generateSecretToken, sha256Hex, type TokenVault } from "@quieroeso/integrations/crypto";
import {
  buildAuthorizationUrl,
  createPkcePair,
  MercadoPagoApiError,
  type MercadoPagoTokens,
} from "@quieroeso/integrations/mercadopago";
import { getLogger } from "@quieroeso/observability";
import { DomainError } from "../errors";
import { writeAuditEvent } from "../security/audit-log";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** Tokens are refreshed when they expire within this window. */
export const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROVIDER = "mercadopago";

export type MercadoPagoOAuthGateway = {
  exchangeCode(params: { code: string; redirectUri: string; codeVerifier: string }): Promise<MercadoPagoTokens>;
  refresh(refreshToken: string): Promise<MercadoPagoTokens>;
};

export type ConnectionDeps = {
  db: PrismaClient;
  vault: TokenVault;
  oauth: MercadoPagoOAuthGateway;
  config: { authBaseUrl: string; clientId: string; redirectUri: string };
  now?: () => Date;
};

const accessContext = (userId: string) => `mp:access:${userId}`;
const refreshContext = (userId: string) => `mp:refresh:${userId}`;
const verifierContext = (stateHash: string) => `oauth:verifier:${stateHash}`;

/** Starts OAuth: stores a single-use state with its PKCE verifier and returns the redirect URL. */
export async function startMercadoPagoAuthorization(
  deps: ConnectionDeps,
  userId: string,
): Promise<{ authorizationUrl: string }> {
  const now = deps.now?.() ?? new Date();
  const state = generateSecretToken(32);
  const stateHash = sha256Hex(state);
  const { verifier, challenge } = createPkcePair();
  await deps.db.oAuthState.create({
    data: {
      userId,
      provider: PROVIDER,
      stateHash,
      encryptedCodeVerifier: deps.vault.encrypt(verifier, verifierContext(stateHash)),
      expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
    },
  });
  return {
    authorizationUrl: buildAuthorizationUrl({
      authBaseUrl: deps.config.authBaseUrl,
      clientId: deps.config.clientId,
      redirectUri: deps.config.redirectUri,
      state,
      codeChallenge: challenge,
    }),
  };
}

const INVALID_STATE = "El enlace de conexión venció o ya se usó. Probá conectar de nuevo.";

/**
 * Completes OAuth. The state is consumed atomically (a second use fails), the code
 * is exchanged server-side and tokens are encrypted before the saving transaction.
 */
export async function completeMercadoPagoAuthorization(
  deps: ConnectionDeps,
  params: { userId: string; state: string; code: string },
): Promise<{ mercadoPagoUserId: string }> {
  const now = deps.now?.() ?? new Date();
  const stateHash = sha256Hex(params.state);
  const consumed = await deps.db.oAuthState.updateMany({
    where: {
      stateHash,
      userId: params.userId,
      provider: PROVIDER,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new DomainError("INVALID_STATE", INVALID_STATE);

  const stored = await deps.db.oAuthState.findUniqueOrThrow({ where: { stateHash } });
  const codeVerifier = deps.vault.decrypt(stored.encryptedCodeVerifier, verifierContext(stateHash));

  let tokens: MercadoPagoTokens;
  try {
    tokens = await deps.oauth.exchangeCode({
      code: params.code,
      redirectUri: deps.config.redirectUri,
      codeVerifier,
    });
  } catch (error) {
    getLogger().warn({ err: error }, "mercadopago code exchange failed");
    throw new DomainError("UPSTREAM_UNAVAILABLE", "No pudimos conectar con Mercado Pago. Probá de nuevo.");
  }

  const encrypted = {
    encryptedAccessToken: deps.vault.encrypt(tokens.accessToken, accessContext(params.userId)),
    encryptedRefreshToken: deps.vault.encrypt(tokens.refreshToken, refreshContext(params.userId)),
    tokenExpiresAt: tokens.expiresAt,
    keyVersion: deps.vault.activeVersion,
    liveMode: tokens.liveMode,
    scope: tokens.scope,
    status: "ACTIVE" as const,
    lastRefreshedAt: now,
  };

  const inUse = () =>
    new DomainError("CONFLICT", "Esa cuenta de Mercado Pago ya está conectada a otro usuario.");
  await deps.db.$transaction(async (tx) => {
    const activeElsewhere = await tx.mercadoPagoConnection.findFirst({
      where: {
        mercadoPagoUserId: tokens.mercadoPagoUserId,
        status: "ACTIVE",
        userId: { not: params.userId },
      },
      select: { id: true },
    });
    if (activeElsewhere) throw inUse();
    await tx.mercadoPagoConnection.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, mercadoPagoUserId: tokens.mercadoPagoUserId, ...encrypted },
      update: { mercadoPagoUserId: tokens.mercadoPagoUserId, ...encrypted },
    });
    await writeAuditEvent(tx, {
      actorUserId: params.userId,
      action: "mercadopago.connected",
      targetType: "mercadopago_connection",
      targetId: params.userId,
      metadata: { liveMode: tokens.liveMode },
    });
  }).catch((error: unknown) => {
    // Partial unique index: one ACTIVE connection per Mercado Pago account.
    throw isUniqueViolation(error) ? inUse() : error;
  });
  await deps.db.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  return { mercadoPagoUserId: tokens.mercadoPagoUserId };
}

export type ActiveConnection = { accessToken: string; mercadoPagoUserId: string };

/**
 * Returns a usable access token for the user, refreshing it under a row lock so
 * concurrent requests perform a single refresh (refresh tokens are single use).
 */
export async function getActiveAccessToken(deps: ConnectionDeps, userId: string): Promise<ActiveConnection> {
  const now = deps.now?.() ?? new Date();
  const connection = await deps.db.mercadoPagoConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "ACTIVE") {
    throw new DomainError("MERCADOPAGO_NOT_CONNECTED", "Quien armó la lista no tiene Mercado Pago conectado.");
  }
  if (connection.tokenExpiresAt.getTime() - now.getTime() > REFRESH_WINDOW_MS) {
    return {
      accessToken: deps.vault.decrypt(connection.encryptedAccessToken, accessContext(userId)),
      mercadoPagoUserId: connection.mercadoPagoUserId,
    };
  }

  const outcome = await deps.db.$transaction(
    async (tx): Promise<ActiveConnection | "REVOKED"> => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "MercadoPagoConnection" WHERE "userId" = ${userId} FOR UPDATE`;
      if (!locked) throw new DomainError("MERCADOPAGO_NOT_CONNECTED", "Mercado Pago no está conectado.");
      const current = await tx.mercadoPagoConnection.findUniqueOrThrow({ where: { userId } });
      if (current.status !== "ACTIVE") {
        throw new DomainError("MERCADOPAGO_NOT_CONNECTED", "Mercado Pago no está conectado.");
      }
      // Another request refreshed while we waited for the lock.
      if (current.tokenExpiresAt.getTime() - now.getTime() > REFRESH_WINDOW_MS) {
        return {
          accessToken: deps.vault.decrypt(current.encryptedAccessToken, accessContext(userId)),
          mercadoPagoUserId: current.mercadoPagoUserId,
        };
      }
      const refreshToken = deps.vault.decrypt(current.encryptedRefreshToken, refreshContext(userId));
      let tokens: MercadoPagoTokens;
      try {
        tokens = await deps.oauth.refresh(refreshToken);
      } catch (error) {
        if (error instanceof MercadoPagoApiError && error.kind === "INVALID_GRANT") {
          // Persisted after the transaction: throwing here would roll the update back.
          return "REVOKED";
        }
        if (current.tokenExpiresAt > now) {
          // Still valid: use it and retry the refresh later.
          return {
            accessToken: deps.vault.decrypt(current.encryptedAccessToken, accessContext(userId)),
            mercadoPagoUserId: current.mercadoPagoUserId,
          };
        }
        throw new DomainError("UPSTREAM_UNAVAILABLE", "Mercado Pago no responde. Probá en unos minutos.");
      }
      await tx.mercadoPagoConnection.update({
        where: { userId },
        data: {
          encryptedAccessToken: deps.vault.encrypt(tokens.accessToken, accessContext(userId)),
          encryptedRefreshToken: deps.vault.encrypt(tokens.refreshToken, refreshContext(userId)),
          tokenExpiresAt: tokens.expiresAt,
          keyVersion: deps.vault.activeVersion,
          lastRefreshedAt: now,
        },
      });
      await writeAuditEvent(tx, {
        actorUserId: null,
        action: "mercadopago.token_refreshed",
        targetType: "mercadopago_connection",
        targetId: userId,
      });
      return { accessToken: tokens.accessToken, mercadoPagoUserId: current.mercadoPagoUserId };
    },
    { timeout: 15_000 },
  );
  if (outcome === "REVOKED") {
    await deps.db.mercadoPagoConnection.update({ where: { userId }, data: { status: "REVOKED" } });
    throw new DomainError("MERCADOPAGO_NOT_CONNECTED", "La conexión con Mercado Pago fue revocada.");
  }
  return outcome;
}

export type ConnectionStatus = {
  status: "NOT_CONNECTED" | "ACTIVE" | "EXPIRED" | "REVOKED" | "DISCONNECTED";
  mercadoPagoUserId: string | null;
  liveMode: boolean;
  connectedAt: Date | null;
};

/** Connection state for display; never includes tokens. */
export async function getConnectionStatus(db: PrismaClient, userId: string, now = new Date()): Promise<ConnectionStatus> {
  const connection = await db.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { status: true, mercadoPagoUserId: true, liveMode: true, createdAt: true, tokenExpiresAt: true },
  });
  if (!connection) return { status: "NOT_CONNECTED", mercadoPagoUserId: null, liveMode: false, connectedAt: null };
  const expired = connection.status === "ACTIVE" && connection.tokenExpiresAt <= now;
  return {
    status: expired ? "EXPIRED" : connection.status,
    mercadoPagoUserId: connection.mercadoPagoUserId,
    liveMode: connection.liveMode,
    connectedAt: connection.createdAt,
  };
}

/** Disconnects and wipes stored tokens. Existing contribution history is kept. */
export async function disconnectMercadoPago(db: PrismaClient, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const result = await tx.mercadoPagoConnection.updateMany({
      where: { userId },
      data: { status: "DISCONNECTED", encryptedAccessToken: "", encryptedRefreshToken: "" },
    });
    if (result.count === 0) return;
    await writeAuditEvent(tx, {
      actorUserId: userId,
      action: "mercadopago.disconnected",
      targetType: "mercadopago_connection",
      targetId: userId,
    });
  });
}
