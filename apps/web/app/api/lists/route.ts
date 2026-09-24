import { createList, createListSchema, listOwnedLists } from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { toOwnerListDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { requireUser } from "@/lib/session";

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const lists = await listOwnedLists(getPrisma(), user.id);
  return jsonResponse({ lists: lists.map(toOwnerListDto) });
});

export const POST = handle(async (request) => {
  assertSameOrigin(request);
  const user = await requireUser(request);
  const input = createListSchema.parse(await readJsonBody(request, 16 * 1024));
  const list = await createList(getPrisma(), user.id, input);
  return jsonResponse({ list: toOwnerListDto(list) }, { status: 201 });
});
