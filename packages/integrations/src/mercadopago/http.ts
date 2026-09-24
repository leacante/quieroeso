import { randomUUID } from "node:crypto";
import { getLogger } from "@quieroeso/observability";

export type MercadoPagoErrorKind =
  | "UNAUTHORIZED"
  | "INVALID_GRANT"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "TIMEOUT";

export class MercadoPagoApiError extends Error {
  constructor(
    readonly kind: MercadoPagoErrorKind,
    readonly status: number | null,
  ) {
    super(`Mercado Pago API error: ${kind}${status ? ` (${status})` : ""}`);
    this.name = "MercadoPagoApiError";
  }
}

export type MercadoPagoHttpOptions = {
  apiBaseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * JSON request to the Mercado Pago API with timeout, request id and error mapping.
 * Never logs bodies (they may contain tokens or payer data).
 */
export async function mercadoPagoRequest(
  options: MercadoPagoHttpOptions,
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown; accessToken?: string; idempotencyKey?: string } = {},
): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const requestId = randomUUID();
  const headers: Record<string, string> = { Accept: "application/json", "X-Request-Id": requestId };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;

  let response: Response;
  try {
    response = await doFetch(`${options.apiBaseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
  } catch (error) {
    const kind = error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "UPSTREAM";
    getLogger().warn({ requestId, path: path.split("?")[0], kind }, "mercadopago request failed");
    throw new MercadoPagoApiError(kind, null);
  }

  if (response.ok) return response.json();
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  getLogger().warn(
    { requestId, path: path.split("?")[0], status: response.status },
    "mercadopago request rejected",
  );
  if (response.status === 400 && payload.error === "invalid_grant") {
    throw new MercadoPagoApiError("INVALID_GRANT", 400);
  }
  if (response.status === 401 || response.status === 403) {
    throw new MercadoPagoApiError("UNAUTHORIZED", response.status);
  }
  if (response.status === 404) throw new MercadoPagoApiError("NOT_FOUND", 404);
  if (response.status === 429) throw new MercadoPagoApiError("RATE_LIMITED", 429);
  if (response.status >= 400 && response.status < 500) {
    throw new MercadoPagoApiError("BAD_REQUEST", response.status);
  }
  throw new MercadoPagoApiError("UPSTREAM", response.status);
}
