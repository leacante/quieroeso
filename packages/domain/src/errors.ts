export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UPSTREAM_UNAVAILABLE"
  | "UNSUPPORTED_URL"
  | "MERCADOPAGO_NOT_CONNECTED";

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UPSTREAM_UNAVAILABLE: 503,
  UNSUPPORTED_URL: 422,
  MERCADOPAGO_NOT_CONNECTED: 409,
};

/**
 * Expected business failure. `detail` is shown to end users, so it must be safe
 * (Spanish, no identifiers of other users, no secrets).
 */
export class DomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: DomainErrorCode,
    readonly detail: string,
    readonly extra: { retryAfterSeconds?: number; fields?: Record<string, string> } = {},
  ) {
    super(`${code}: ${detail}`);
    this.name = "DomainError";
    this.status = STATUS_BY_CODE[code];
  }
}

export function notFound(detail = "No encontramos lo que buscabas."): DomainError {
  return new DomainError("NOT_FOUND", detail);
}
