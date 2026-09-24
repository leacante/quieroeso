import { removeItem, updateItem, updateItemSchema } from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { toOwnerItemDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { requireUser } from "@/lib/session";

type Context = RouteContext<"/api/lists/[id]/items/[itemId]">;

export const PATCH = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id, itemId } = await params;
  const patch = updateItemSchema.parse(await readJsonBody(request, 16 * 1024));
  const item = await updateItem(getPrisma(), { listId: id, ownerId: user.id, itemId }, patch);
  return jsonResponse({ item: toOwnerItemDto(item) });
});

/** Deletes the product, or archives it when it has contribution history. */
export const DELETE = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id, itemId } = await params;
  const outcome = await removeItem(getPrisma(), { listId: id, ownerId: user.id, itemId });
  return jsonResponse({ outcome });
});
