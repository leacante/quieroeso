import { completeMercadoPagoAuthorization, DomainError } from "@quieroeso/domain";
import { logger } from "@/lib/server/logger";
import { getConnectionDeps } from "@/lib/server/services";
import { absoluteUrl } from "@/lib/site";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function back(status: string): Response {
  return Response.redirect(absoluteUrl(`/dashboard/mercadopago?status=${status}`), 303);
}

/** OAuth redirect target. Never renders provider data; always redirects to the panel. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const user = await resolveSessionUser(request.headers);
  if (!user) return Response.redirect(absoluteUrl("/login?next=/dashboard/mercadopago"), 303);

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !state || !code) return back("denied");

  try {
    await completeMercadoPagoAuthorization(getConnectionDeps(), { userId: user.id, state, code });
    return back("connected");
  } catch (error) {
    if (error instanceof DomainError) {
      return back(error.code === "CONFLICT" ? "in-use" : error.code === "INVALID_STATE" ? "expired" : "error");
    }
    logger.error({ err: error }, "mercadopago oauth callback failed");
    return back("error");
  }
}
