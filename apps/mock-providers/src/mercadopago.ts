import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
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

type Seller = { userId: number; name: string };

export const MP_TEST_SELLERS: Record<string, Seller> = {
  ana: { userId: 1001, name: "Ana Pérez (vendedora de prueba)" },
  bruno: { userId: 1002, name: "Bruno Díaz (vendedor de prueba)" },
};

type Preference = {
  id: string;
  collectorId: number;
  idempotencyKey: string | null;
  title: string;
  unitPrice: number;
  marketplaceFee: number | null;
  externalReference: string;
  notificationUrl: string;
  backUrls: { success?: string; pending?: string; failure?: string };
};

type PaymentStatus =
  "pending" | "in_process" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";

type Payment = {
  id: number;
  preferenceId: string;
  status: PaymentStatus;
  statusDetail: string;
  amount: number;
  marketplaceFee: number | null;
  externalReference: string;
  collectorId: number;
  notificationUrl: string;
  createdAt: string;
  approvedAt: string | null;
  updatedAt: string;
};

const pendingCodes = new Map<
  string,
  { seller: Seller; redirectUri: string; challenge: string | null; expiresAt: number }
>();
const accessTokens = new Map<string, { seller: Seller; expiresAt: number }>();
const refreshTokens = new Map<string, Seller>();
const preferences = new Map<string, Preference>();
const preferencesByKey = new Map<string, string>();
const payments = new Map<number, Payment>();
let nextPaymentId = 90_000_001;
let nextEventId = 70_000_001;
let apiOutage = false;

function now(): string {
  return new Date().toISOString();
}

function issueTokens(seller: Seller) {
  const accessToken = `APP_USR-mock-${seller.userId}-${randomBytes(12).toString("hex")}`;
  const refreshToken = `TG-mock-${randomBytes(16).toString("hex")}`;
  accessTokens.set(accessToken, { seller, expiresAt: Date.now() + 180 * 24 * 3600_000 });
  refreshTokens.set(refreshToken, seller);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 15_552_000,
    scope: "offline_access read write",
    user_id: seller.userId,
    refresh_token: refreshToken,
    public_key: `APP_USR-mock-public-${seller.userId}`,
    live_mode: false,
  };
}

function sellerFor(request: Parameters<Route["handler"]>[0]): Seller | null {
  const entry = accessTokens.get(bearerToken(request) ?? "");
  return entry && entry.expiresAt > Date.now() ? entry.seller : null;
}

function paymentJson(payment: Payment) {
  return {
    id: payment.id,
    status: payment.status,
    status_detail: payment.statusDetail,
    transaction_amount: payment.amount,
    currency_id: "ARS",
    external_reference: payment.externalReference,
    collector_id: payment.collectorId,
    date_created: payment.createdAt,
    date_approved: payment.approvedAt,
    date_last_updated: payment.updatedAt,
    live_mode: false,
    payment_method_id: "account_money",
    fee_details: payment.marketplaceFee
      ? [{ type: "application_fee", amount: payment.marketplaceFee, fee_payer: "collector" }]
      : [],
    payer: { email: "comprador***@example.com" },
  };
}

/** Builds the signed notification exactly as Mercado Pago documents it. */
export function signNotification(
  dataId: string,
  requestId: string,
  ts: number,
  secret: string,
): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

function webhookTarget(notificationUrl: string, paymentId: number): URL {
  const url = new URL(notificationUrl);
  if (config.webhookTargetOrigin) {
    const origin = new URL(config.webhookTargetOrigin);
    url.protocol = origin.protocol;
    url.host = origin.host;
  }
  url.searchParams.set("data.id", String(paymentId));
  url.searchParams.set("type", "payment");
  return url;
}

export async function deliverWebhook(
  payment: Payment,
  action: string,
  options: { secret?: string } = {},
): Promise<number> {
  const requestId = randomUUID();
  const ts = Date.now();
  const eventId = nextEventId++;
  const body = JSON.stringify({
    action,
    api_version: "v1",
    data: { id: String(payment.id) },
    date_created: now(),
    id: eventId,
    live_mode: false,
    type: "payment",
    user_id: String(payment.collectorId),
  });
  const target = webhookTarget(payment.notificationUrl, payment.id);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-signature": signNotification(
            String(payment.id),
            requestId,
            ts,
            options.secret ?? config.mp.webhookSecret,
          ),
        },
        body,
        signal: AbortSignal.timeout(22_000),
      });
      console.warn(`[mp] webhook ${action} payment=${payment.id} -> ${response.status}`);
      if (response.ok) return response.status;
    } catch (error) {
      console.warn(
        `[mp] webhook delivery failed (attempt ${attempt}): ${(error as Error).message}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  return 0;
}

function updateStatus(payment: Payment, status: PaymentStatus): void {
  payment.status = status;
  payment.statusDetail = {
    approved: "accredited",
    rejected: "cc_rejected_other_reason",
    refunded: "refunded",
    charged_back: "settled",
    pending: "pending_waiting_payment",
    in_process: "pending_review_manual",
    cancelled: "expired",
  }[status];
  payment.updatedAt = now();
  if (status === "approved") payment.approvedAt ??= payment.updatedAt;
}

function outage(response: Parameters<Route["handler"]>[2]): boolean {
  if (!apiOutage) return false;
  sendJson(response, 503, { message: "service unavailable", status: 503 });
  return true;
}

export const mpRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/mp\/authorization$/,
    handler(request, _params, response) {
      const q = request.url.searchParams;
      if (q.get("client_id") !== config.mp.clientId || q.get("response_type") !== "code") {
        sendHtml(response, 400, page("Error", "<h1>Solicitud OAuth inválida</h1>"));
        return;
      }
      if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
        sendHtml(response, 400, page("Error", "<h1>Falta PKCE (S256)</h1>"));
        return;
      }
      const carry = hiddenInputs({
        redirect_uri: q.get("redirect_uri"),
        state: q.get("state"),
        code_challenge: q.get("code_challenge"),
      });
      const buttons = Object.entries(MP_TEST_SELLERS)
        .map(
          ([key, seller]) => `<form method="post" action="/mp/authorization/approve">${carry}
            <input type="hidden" name="seller" value="${key}">
            <button type="submit" data-testid="mp-seller-${key}">Autorizar como ${escapeHtml(seller.name)}</button></form>`,
        )
        .join("")
        .concat(
          `<form method="post" action="/mp/authorization/approve">${carry}
            <input type="hidden" name="seller" value="new">
            <button type="submit" class="secondary" data-testid="mp-seller-new">Autorizar con una cuenta nueva</button></form>`,
        );
      sendHtml(
        response,
        200,
        page(
          "Mercado Pago",
          `<h1>QuieroEso quiere conectarse con tu cuenta de Mercado Pago</h1>
          <p>Podrá crear cobros a tu nombre. El dinero se acredita en tu cuenta.</p>
          <div class="card">${buttons}</div>
          <form method="post" action="/mp/authorization/deny">${carry}<button type="submit" class="secondary">Cancelar</button></form>`,
          "#009ee3",
        ),
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/mp\/authorization\/(approve|deny)$/,
    handler(request, [decision], response) {
      const body = parseBody(request);
      const target = new URL(String(body.redirect_uri ?? ""));
      if (typeof body.state === "string") target.searchParams.set("state", body.state);
      // "new" creates a fresh seller account, so tests do not share Mercado Pago identities.
      const seller =
        body.seller === "new"
          ? { userId: 2_000_000 + Math.floor(Math.random() * 1_000_000), name: "Cuenta nueva" }
          : MP_TEST_SELLERS[String(body.seller ?? "")];
      if (decision === "deny" || !seller) {
        target.searchParams.set("error", "access_denied");
        redirect(response, target.toString());
        return;
      }
      const code = `TG-code-${randomBytes(12).toString("hex")}`;
      pendingCodes.set(code, {
        seller,
        redirectUri: String(body.redirect_uri),
        challenge: String(body.code_challenge ?? "") || null,
        expiresAt: Date.now() + 10 * 60_000,
      });
      target.searchParams.set("code", code);
      redirect(response, target.toString());
    },
  },
  {
    method: "POST",
    pattern: /^\/mp\/oauth\/token$/,
    handler(request, _params, response) {
      if (outage(response)) return;
      const body = parseBody(request);
      const { clientId, clientSecret } = clientCredentials(request, body);
      if (clientId !== config.mp.clientId || clientSecret !== config.mp.clientSecret) {
        sendJson(response, 401, {
          error: "invalid_client",
          message: "invalid client_id or client_secret",
          status: 401,
        });
        return;
      }
      if (body.grant_type === "authorization_code") {
        const code = String(body.code ?? "");
        const pending = pendingCodes.get(code);
        pendingCodes.delete(code);
        if (
          !pending ||
          pending.expiresAt < Date.now() ||
          pending.redirectUri !== body.redirect_uri
        ) {
          sendJson(response, 400, {
            error: "invalid_grant",
            message: "invalid authorization code",
            status: 400,
          });
          return;
        }
        const verifier = String(body.code_verifier ?? "");
        if (
          pending.challenge &&
          createHash("sha256").update(verifier).digest("base64url") !== pending.challenge
        ) {
          sendJson(response, 400, {
            error: "invalid_grant",
            message: "code_verifier mismatch",
            status: 400,
          });
          return;
        }
        sendJson(response, 200, issueTokens(pending.seller));
        return;
      }
      if (body.grant_type === "refresh_token") {
        const token = String(body.refresh_token ?? "");
        const seller = refreshTokens.get(token);
        refreshTokens.delete(token);
        if (!seller) {
          sendJson(response, 400, {
            error: "invalid_grant",
            message: "invalid refresh_token",
            status: 400,
          });
          return;
        }
        sendJson(response, 200, issueTokens(seller));
        return;
      }
      sendJson(response, 400, { error: "unsupported_grant_type", status: 400 });
    },
  },
  {
    method: "POST",
    pattern: /^\/mp\/checkout\/preferences$/,
    handler(request, _params, response) {
      if (outage(response)) return;
      const seller = sellerFor(request);
      if (!seller) {
        sendJson(response, 401, { message: "invalid access token", status: 401 });
        return;
      }
      const key =
        typeof request.headers["x-idempotency-key"] === "string"
          ? request.headers["x-idempotency-key"]
          : null;
      const existingId = key ? preferencesByKey.get(`${seller.userId}:${key}`) : undefined;
      const body = parseBody(request) as {
        items?: { title?: string; unit_price?: number; quantity?: number; currency_id?: string }[];
        external_reference?: string;
        notification_url?: string;
        marketplace_fee?: number;
        back_urls?: Preference["backUrls"];
      };
      const item = body.items?.[0];
      if (
        body.items?.length !== 1 ||
        !item?.title ||
        typeof item.unit_price !== "number" ||
        item.quantity !== 1 ||
        item.currency_id !== "ARS" ||
        !body.external_reference ||
        !body.notification_url
      ) {
        sendJson(response, 400, {
          message: "invalid preference",
          error: "bad_request",
          status: 400,
        });
        return;
      }
      if (
        body.marketplace_fee !== undefined &&
        (body.marketplace_fee <= 0 || body.marketplace_fee >= item.unit_price)
      ) {
        sendJson(response, 400, {
          message: "invalid marketplace_fee",
          error: "bad_request",
          status: 400,
        });
        return;
      }
      const preference: Preference = existingId
        ? preferences.get(existingId)!
        : {
            id: `${seller.userId}-${randomUUID()}`,
            collectorId: seller.userId,
            idempotencyKey: key,
            title: item.title,
            unitPrice: item.unit_price,
            marketplaceFee: body.marketplace_fee ?? null,
            externalReference: body.external_reference,
            notificationUrl: body.notification_url,
            backUrls: body.back_urls ?? {},
          };
      preferences.set(preference.id, preference);
      if (key) preferencesByKey.set(`${seller.userId}:${key}`, preference.id);
      const initPoint = `${config.publicUrl}/mp/checkout/pay?pref_id=${encodeURIComponent(preference.id)}`;
      sendJson(response, existingId ? 200 : 201, {
        id: preference.id,
        collector_id: preference.collectorId,
        external_reference: preference.externalReference,
        init_point: initPoint,
        sandbox_init_point: initPoint,
        marketplace_fee: preference.marketplaceFee ?? 0,
        date_created: now(),
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/mp\/checkout\/pay$/,
    handler(request, _params, response) {
      const preference = preferences.get(request.url.searchParams.get("pref_id") ?? "");
      if (!preference) {
        sendHtml(response, 404, page("Mercado Pago", "<h1>No encontramos este pago</h1>"));
        return;
      }
      const amount = preference.unitPrice.toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
      });
      const fee = preference.marketplaceFee
        ? preference.marketplaceFee.toLocaleString("es-AR", { style: "currency", currency: "ARS" })
        : "sin comisión de plataforma";
      const form = (outcome: string, label: string, klass = "") =>
        `<form method="post" action="/mp/checkout/pay">${hiddenInputs({ pref_id: preference.id, outcome })}
         <button type="submit" class="${klass}" data-testid="mp-pay-${outcome}">${label}</button></form>`;
      sendHtml(
        response,
        200,
        page(
          "Mercado Pago",
          `<h1>Pagá tu aporte</h1>
          <div class="card"><p><strong>${escapeHtml(preference.title)}</strong></p>
          <p>Total: <strong data-testid="mp-amount">${escapeHtml(amount)}</strong></p>
          <p class="muted">Comisión de la plataforma (la paga el vendedor): ${escapeHtml(fee)}</p></div>
          ${form("approved", "Pagar (aprobado)")}
          ${form("pending", "Pagar en efectivo (queda pendiente)", "secondary")}
          ${form("rejected", "Simular pago rechazado", "danger")}`,
          "#009ee3",
        ),
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/mp\/checkout\/pay$/,
    async handler(request, _params, response) {
      const body = parseBody(request);
      const preference = preferences.get(String(body.pref_id ?? ""));
      if (!preference) {
        sendHtml(response, 404, page("Mercado Pago", "<h1>No encontramos este pago</h1>"));
        return;
      }
      const outcome =
        (["approved", "pending", "rejected"] as const).find((value) => value === body.outcome) ??
        "approved";
      const payment: Payment = {
        id: nextPaymentId++,
        preferenceId: preference.id,
        status: "pending",
        statusDetail: "",
        amount: preference.unitPrice,
        marketplaceFee: preference.marketplaceFee,
        externalReference: preference.externalReference,
        collectorId: preference.collectorId,
        notificationUrl: preference.notificationUrl,
        createdAt: now(),
        approvedAt: null,
        updatedAt: now(),
      };
      updateStatus(payment, outcome);
      payments.set(payment.id, payment);
      void deliverWebhook(payment, "payment.created");

      const back =
        outcome === "approved"
          ? preference.backUrls.success
          : outcome === "pending"
            ? preference.backUrls.pending
            : preference.backUrls.failure;
      if (!back) {
        sendHtml(response, 200, page("Mercado Pago", `<h1>Pago ${escapeHtml(outcome)}</h1>`));
        return;
      }
      const target = new URL(back);
      target.searchParams.set("collection_id", String(payment.id));
      target.searchParams.set("payment_id", String(payment.id));
      target.searchParams.set("status", payment.status);
      target.searchParams.set("collection_status", payment.status);
      target.searchParams.set("external_reference", payment.externalReference);
      target.searchParams.set("preference_id", preference.id);
      redirect(response, target.toString());
    },
  },
  {
    method: "GET",
    pattern: /^\/mp\/v1\/payments\/(\d+)$/,
    handler(request, [id = ""], response) {
      if (outage(response)) return;
      const seller = sellerFor(request);
      if (!seller) {
        sendJson(response, 401, { message: "invalid access token", status: 401 });
        return;
      }
      const payment = payments.get(Number(id));
      if (!payment || payment.collectorId !== seller.userId) {
        sendJson(response, 404, { message: "Payment not found", status: 404 });
        return;
      }
      sendJson(response, 200, paymentJson(payment));
    },
  },
  // ---- Admin / test hooks -------------------------------------------------
  {
    method: "GET",
    pattern: /^\/mp\/_admin$/,
    handler(_request, _params, response) {
      const rows = [...payments.values()]
        .reverse()
        .map(
          (
            payment,
          ) => `<tr><td>${payment.id}</td><td>${escapeHtml(payment.status)}</td><td>${payment.amount}</td>
          <td><form method="post" action="/_admin/mp/payments/${payment.id}/status">${hiddenInputs({ status: "refunded", html: "1" })}<button class="secondary">Reembolsar</button></form>
          <form method="post" action="/_admin/mp/payments/${payment.id}/status">${hiddenInputs({ status: "charged_back", html: "1" })}<button class="danger">Contracargo</button></form>
          <form method="post" action="/_admin/mp/payments/${payment.id}/resend">${hiddenInputs({ html: "1" })}<button class="secondary">Reenviar webhook</button></form></td></tr>`,
        )
        .join("");
      sendHtml(
        response,
        200,
        page(
          "Pagos",
          `<h1>Pagos simulados</h1><table><thead><tr><th>ID</th><th>Estado</th><th>Monto</th><th>Acciones</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sin pagos todavía</td></tr>'}</tbody></table>`,
          "#009ee3",
        ),
      );
    },
  },
  {
    method: "GET",
    pattern: /^\/_admin\/mp\/payments$/,
    handler(_request, _params, response) {
      sendJson(response, 200, [...payments.values()].map(paymentJson));
    },
  },
  {
    method: "POST",
    pattern: /^\/_admin\/mp\/payments\/(\d+)\/status$/,
    async handler(request, [id = ""], response) {
      const body = parseBody(request);
      const payment = payments.get(Number(id));
      const status = String(body.status ?? "") as PaymentStatus;
      if (
        !payment ||
        ![
          "approved",
          "rejected",
          "refunded",
          "charged_back",
          "cancelled",
          "pending",
          "in_process",
        ].includes(status)
      ) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      updateStatus(payment, status);
      const delivered = await deliverWebhook(payment, "payment.updated");
      if (body.html) redirect(response, "/mp/_admin", 303);
      else
        sendJson(response, 200, {
          ok: true,
          webhookStatus: delivered,
          payment: paymentJson(payment),
        });
    },
  },
  {
    method: "POST",
    pattern: /^\/_admin\/mp\/payments\/(\d+)\/resend$/,
    async handler(request, [id = ""], response) {
      const body = parseBody(request);
      const payment = payments.get(Number(id));
      if (!payment) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const times = Math.min(Number(body.times ?? 1) || 1, 5);
      const statuses: number[] = [];
      for (let i = 0; i < times; i++) {
        statuses.push(
          await deliverWebhook(payment, "payment.updated", {
            secret: typeof body.secret === "string" ? body.secret : undefined,
          }),
        );
      }
      if (body.html) redirect(response, "/mp/_admin", 303);
      else sendJson(response, 200, { ok: true, webhookStatuses: statuses });
    },
  },
  {
    method: "POST",
    pattern: /^\/_admin\/mp\/outage$/,
    handler(request, _params, response) {
      apiOutage = Boolean(parseBody(request).enabled);
      sendJson(response, 200, { ok: true, outage: apiOutage });
    },
  },
];

export function resetMercadoPago(): void {
  preferences.clear();
  preferencesByKey.clear();
  payments.clear();
  apiOutage = false;
}
