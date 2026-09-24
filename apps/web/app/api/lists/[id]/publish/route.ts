import {
  enforceRateLimit,
  publishList,
  publishListSchema,
  RATE_LIMITS,
  rateLimitKeys,
} from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { toOwnerListDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { getListDeps } from "@/lib/server/services";
import { absoluteUrl } from "@/lib/site";
import { requireUser } from "@/lib/session";

export const POST = handle(async (request, { params }: RouteContext<"/api/lists/[id]/publish">) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id } = await params;
  const { visibility } = publishListSchema.parse(await readJsonBody(request, 4 * 1024));
  await enforceRateLimit(getPrisma(), rateLimitKeys.publish(user.id), RATE_LIMITS.publishPerUser);
  const result = await publishList(getListDeps(), { listId: id, ownerId: user.id, visibility });
  return jsonResponse({
    list: toOwnerListDto(result.list),
    shareUrl: result.shareToken ? absoluteUrl(`/s/${result.shareToken}`) : null,
    promotion: result.promotion,
  });
});
