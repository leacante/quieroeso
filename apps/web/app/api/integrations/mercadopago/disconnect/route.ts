import { disconnectMercadoPago } from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { requireUser } from "@/lib/session";

export const POST = handle(async (request) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  await disconnectMercadoPago(getPrisma(), user.id);
  return new Response(null, { status: 204 });
});
