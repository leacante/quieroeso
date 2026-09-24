import "server-only";

import { getEnv, type AppEnvironment } from "@quieroeso/config";
import { getPrisma } from "@quieroeso/db";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

const DAY_SECONDS = 60 * 60 * 24;

/** Client credentials the mock server accepts. Only used when MOCK_PROVIDERS=true. */
export const MOCK_GOOGLE_CLIENT = { id: "mock-google-client", secret: "mock-google-secret" };

function googleProvider(
  env: AppEnvironment,
): Pick<BetterAuthOptions, "socialProviders" | "plugins"> {
  if (env.MOCK_PROVIDERS) {
    const publicUrl = env.MOCK_PROVIDERS_PUBLIC_URL;
    const internalUrl = env.MOCK_PROVIDERS_INTERNAL_URL;
    return {
      socialProviders: {},
      plugins: [
        genericOAuth({
          config: [
            {
              // Same provider id as production so accounts behave identically.
              providerId: "google",
              name: "Google (simulado)",
              authorizationUrl: `${publicUrl}/google/o/oauth2/v2/auth`,
              tokenUrl: `${internalUrl}/google/token`,
              userInfoUrl: `${internalUrl}/google/userinfo`,
              clientId: MOCK_GOOGLE_CLIENT.id,
              clientSecret: MOCK_GOOGLE_CLIENT.secret,
              scopes: ["openid", "email", "profile"],
              pkce: true,
              // Google identities are keyed by the stable `sub` claim, never the email.
              accountSubject: ({ profile }) => String(profile.sub ?? profile.id),
            },
          ],
        }),
      ],
    };
  }
  return {
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
        prompt: "select_account",
      },
    },
    plugins: [],
  };
}

function createAuth(env: AppEnvironment) {
  const provider = googleProvider(env);
  return betterAuth({
    appName: "QuieroEso",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.APP_URL).origin],
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: { enabled: false },
    socialProviders: provider.socialProviders,
    account: {
      // Google tokens are not needed after sign-in; keep them encrypted at rest anyway.
      encryptOAuthTokens: true,
      accountLinking: { enabled: false },
    },
    session: {
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith("https://"),
      cookiePrefix: "quieroeso",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
    databaseHooks: {
      session: {
        create: {
          // Raw client IPs are never persisted (see "Seguridad y privacidad").
          before: async (session) => ({ data: { ...session, ipAddress: null } }),
        },
      },
    },
    telemetry: { enabled: false },
    plugins: [...(provider.plugins ?? []), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Lazily builds the Better Auth instance so secrets are read at request time, not import time. */
export function getAuth(): Auth {
  instance ??= createAuth(getEnv());
  return instance;
}
