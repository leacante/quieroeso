import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { MercadoPagoApiError, mercadoPagoRequest, type MercadoPagoHttpOptions } from "./http";

export type PkcePair = { verifier: string; challenge: string };

/** RFC 7636 PKCE pair with the S256 method (43-char verifier from 32 random bytes). */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function buildAuthorizationUrl(params: {
  authBaseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(`${params.authBaseUrl.replace(/\/$/, "")}/authorization`);
  url.search = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    platform_id: "mp",
    state: params.state,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.union([z.number(), z.string()]).transform(String),
  scope: z.string().optional(),
  public_key: z.string().optional(),
  live_mode: z.boolean().optional(),
});

export type MercadoPagoTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  mercadoPagoUserId: string;
  scope: string | null;
  liveMode: boolean;
};

export type OAuthClientConfig = MercadoPagoHttpOptions & {
  clientId: string;
  clientSecret: string;
};

function toTokens(raw: unknown, now: Date): MercadoPagoTokens {
  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new MercadoPagoApiError("UPSTREAM", 200);
  const body = parsed.data;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now.getTime() + body.expires_in * 1000),
    mercadoPagoUserId: body.user_id,
    scope: body.scope ?? null,
    liveMode: body.live_mode ?? false,
  };
}

/** Exchanges an authorization code (server-side only) using the PKCE verifier. */
export async function exchangeAuthorizationCode(
  config: OAuthClientConfig,
  params: { code: string; redirectUri: string; codeVerifier: string },
): Promise<MercadoPagoTokens> {
  const raw = await mercadoPagoRequest(config, "POST", "/oauth/token", {
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    },
  });
  return toTokens(raw, new Date());
}

/** Refresh tokens are single use: persist the returned pair atomically. */
export async function refreshAccessToken(
  config: OAuthClientConfig,
  refreshToken: string,
): Promise<MercadoPagoTokens> {
  const raw = await mercadoPagoRequest(config, "POST", "/oauth/token", {
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  return toTokens(raw, new Date());
}
