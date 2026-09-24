import { archiveList, getOwnedList, updateList, updateListSchema } from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { toOwnerItemDto, toOwnerListDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { requireUser } from "@/lib/session";

type Context = RouteContext<"/api/lists/[id]">;

export const GET = handle(async (request, { params }: Context) => {
  const user = await requireUser(request);
  const { id } = await params;
  const list = await getOwnedList(getPrisma(), { listId: id, ownerId: user.id });
  return jsonResponse({ list: { ...toOwnerListDto(list), items: list.items.map(toOwnerItemDto) } });
});

export const PATCH = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id } = await params;
  const patch = updateListSchema.parse(await readJsonBody(request, 16 * 1024));
  const list = await updateList(getPrisma(), { listId: id, ownerId: user.id }, patch);
  return jsonResponse({ list: toOwnerListDto(list) });
});

export const DELETE = handle(async (request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const { id } = await params;
  await archiveList(getPrisma(), { listId: id, ownerId: user.id });
  return new Response(null, { status: 204 });
});
