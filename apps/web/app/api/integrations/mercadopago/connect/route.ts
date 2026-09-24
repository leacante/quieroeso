import { startMercadoPagoAuthorization } from "@quieroeso/domain";
import { jsonResponse } from "@/lib/server/json";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { getConnectionDeps } from "@/lib/server/services";
import { requireUser } from "@/lib/session";

/** Starts OAuth (Authorization Code + PKCE) and returns the Mercado Pago authorization URL. */
export const POST = handle(async (request) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { authorizationUrl } = await startMercadoPagoAuthorization(getConnectionDeps(), user.id);
  return jsonResponse({ authorizationUrl });
});
