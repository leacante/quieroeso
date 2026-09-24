import { getShareToken, rotateShareToken } from "@quieroeso/domain";
import { jsonResponse } from "@/lib/server/json";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { getListDeps } from "@/lib/server/services";
import { absoluteUrl } from "@/lib/site";
import { requireUser } from "@/lib/session";

type Context = RouteContext<"/api/lists/[id]/share-link">;

/** Current secret link of an UNLISTED list (owner only). */
export const GET = handle(async (request, { params }: Context) => {
  const user = await requireUser(request);
  const { id } = await params;
  const token = await getShareToken(getListDeps(), { listId: id, ownerId: user.id });
  return jsonResponse({ shareUrl: token ? absoluteUrl(`/s/${token}`) : null });
});

/** Rotates the secret link; the previous one stops working immediately. */
export const POST = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id } = await params;
  const token = await rotateShareToken(getListDeps(), { listId: id, ownerId: user.id });
  return jsonResponse({ shareUrl: absoluteUrl(`/s/${token}`) });
});
