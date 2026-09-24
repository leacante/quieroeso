import "server-only";

import { DomainError } from "@quieroeso/domain";
import { getEnv } from "./env";
import { toProblemResponse } from "./problem";

type Handler<Context> = (request: Request, context: Context) => Promise<Response>;

/** Wraps a route handler so every thrown error becomes an `application/problem+json` response. */
export function handle<Context>(handler: Handler<Context>): Handler<Context> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toProblemResponse(request, error);
    }
  };
}

/**
 * Rejects cross-site mutations. Browsers always send `Origin` on POST/PATCH/DELETE
 * fetches; its absence or mismatch means the request did not come from our pages.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(getEnv().APP_URL).origin;
  if (origin !== expected) {
    throw new DomainError("FORBIDDEN", "Origen de la solicitud no permitido.");
  }
}
