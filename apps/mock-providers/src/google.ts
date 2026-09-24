import { createHash, randomBytes } from "node:crypto";
import { config } from "./config";
import { hiddenInputs, page } from "./html";
import {
  bearerToken,
  clientCredentials,
  escapeHtml,
  parseBody,
  redirect,
  sendHtml,
  sendJson,
  type Route,
} from "./http";

type GoogleUser = { sub: string; name: string; email: string; picture: string | null };

/** Deterministic test identities. `sub` is stable, emails are not used as keys. */
export const GOOGLE_TEST_USERS: Record<string, GoogleUser> = {
  ana: { sub: "100000000000000000001", name: "Ana Pérez", email: "ana@example.com", picture: null },
  bruno: {
    sub: "100000000000000000002",
    name: "Bruno Díaz",
    email: "bruno@example.com",
    picture: null,
  },
  carla: {
    sub: "100000000000000000003",
    name: "Carla Gómez",
    email: "carla@example.com",
    picture: null,
  },
};

type PendingCode = {
  user: GoogleUser;
  redirectUri: string;
  codeChallenge: string | null;
  expiresAt: number;
};

const codes = new Map<string, PendingCode>();
const accessTokens = new Map<string, GoogleUser>();

function customUser(name: string, email: string): GoogleUser {
  const sub = BigInt(
    `0x${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 15)}`,
  ).toString();
  return { sub: `2${sub.padStart(20, "0")}`, name, email, picture: null };
}

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export const googleRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/google\/o\/oauth2\/v2\/auth$/,
    handler(request, _params, response) {
      const q = request.url.searchParams;
      if (q.get("client_id") !== config.google.clientId || q.get("response_type") !== "code") {
        sendHtml(response, 400, page("Error", "<h1>Solicitud OAuth inválida</h1>"));
        return;
      }
      const carry = hiddenInputs({
        redirect_uri: q.get("redirect_uri"),
        state: q.get("state"),
        code_challenge: q.get("code_challenge"),
      });
      const users = Object.entries(GOOGLE_TEST_USERS)
        .map(
          ([key, user]) => `<form method="post" action="/google/approve">${carry}
            <input type="hidden" name="user" value="${key}">
            <button type="submit" data-testid="google-user-${key}">${escapeHtml(user.name)} · ${escapeHtml(user.email)}</button>
          </form>`,
        )
        .join("");
      sendHtml(
        response,
        200,
        page(
          "Google",
          `<h1>Elegí una cuenta de Google de prueba</h1>
          <div class="card">${users}</div>
          <div class="card">
            <form method="post" action="/google/approve">${carry}
              <label for="name">Nombre</label><input id="name" name="name" required autocomplete="name">
              <label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email">
              <button type="submit" class="secondary">Usar otra cuenta</button>
            </form>
          </div>`,
          "#1a73e8",
        ),
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/google\/approve$/,
    handler(request, _params, response) {
      const body = parseBody(request);
      const redirectUri = String(body.redirect_uri ?? "");
      const user =
        typeof body.user === "string" && GOOGLE_TEST_USERS[body.user]
          ? GOOGLE_TEST_USERS[body.user]
          : customUser(
              String(body.name ?? "Invitado"),
              String(body.email ?? "invitado@example.com"),
            );
      if (!redirectUri || !user) {
        sendHtml(response, 400, page("Error", "<h1>Falta redirect_uri</h1>"));
        return;
      }
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        user,
        redirectUri,
        codeChallenge:
          typeof body.code_challenge === "string" && body.code_challenge
            ? body.code_challenge
            : null,
        expiresAt: Date.now() + 60_000,
      });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (typeof body.state === "string") target.searchParams.set("state", body.state);
      redirect(response, target.toString());
    },
  },
  {
    method: "POST",
    pattern: /^\/google\/token$/,
    handler(request, _params, response) {
      const body = parseBody(request);
      const { clientId, clientSecret } = clientCredentials(request, body);
      if (clientId !== config.google.clientId || clientSecret !== config.google.clientSecret) {
        sendJson(response, 401, { error: "invalid_client" });
        return;
      }
      const code = String(body.code ?? "");
      const pending = codes.get(code);
      codes.delete(code);
      if (!pending || pending.expiresAt < Date.now() || pending.redirectUri !== body.redirect_uri) {
        sendJson(response, 400, { error: "invalid_grant" });
        return;
      }
      if (
        pending.codeChallenge &&
        s256(String(body.code_verifier ?? "")) !== pending.codeChallenge
      ) {
        sendJson(response, 400, {
          error: "invalid_grant",
          error_description: "PKCE verification failed",
        });
        return;
      }
      const accessToken = `mock-google-at-${randomBytes(16).toString("hex")}`;
      accessTokens.set(accessToken, pending.user);
      sendJson(response, 200, {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid email profile",
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/google\/userinfo$/,
    handler(request, _params, response) {
      const user = accessTokens.get(bearerToken(request) ?? "");
      if (!user) {
        sendJson(response, 401, { error: "invalid_token" });
        return;
      }
      sendJson(response, 200, {
        id: user.sub,
        sub: user.sub,
        name: user.name,
        given_name: user.name.split(" ")[0],
        email: user.email,
        email_verified: true,
        picture: user.picture,
      });
    },
  },
];
