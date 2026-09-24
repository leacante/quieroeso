import {
  addManualItem,
  manualItemSchema,
  reorderItems,
  reorderItemsSchema,
} from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { toOwnerItemDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { requireUser } from "@/lib/session";

type Context = RouteContext<"/api/lists/[id]/items">;

/** Creates a manual product. */
export const POST = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id } = await params;
  const input = manualItemSchema.parse(await readJsonBody(request, 16 * 1024));
  const item = await addManualItem(getPrisma(), { listId: id, ownerId: user.id }, input);
  return jsonResponse({ item: toOwnerItemDto(item) }, { status: 201 });
});

/** Reorders active products: `{ itemIds: [...] }` in the new order. */
export const PUT = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id } = await params;
  const { itemIds } = reorderItemsSchema.parse(await readJsonBody(request, 16 * 1024));
  await reorderItems(getPrisma(), { listId: id, ownerId: user.id }, itemIds);
  return new Response(null, { status: 204 });
});
