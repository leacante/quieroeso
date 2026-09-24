import { importItemSchema, importListItem } from "@quieroeso/domain";
import { toOwnerItemDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { getImportDeps } from "@/lib/server/services";
import { requireUser } from "@/lib/session";

/** Imports a Mercado Libre product from a link (listing, catalog or meli.la). */
export const POST = handle(
  async (request, { params }: RouteContext<"/api/lists/[id]/items/import">) => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await params;
    const input = importItemSchema.parse(await readJsonBody(request, 16 * 1024));
    const item = await importListItem(getImportDeps(), { listId: id, ownerId: user.id }, input);
    return jsonResponse({ item: toOwnerItemDto(item) }, { status: 201 });
  },
);
