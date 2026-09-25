import { addCapturedItem, capturedItemSchema } from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { toOwnerItemDto } from "@/lib/server/dto";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { requireUser } from "@/lib/session";

/**
 * Saves a Mercado Libre product captured by the "Guardar en QuieroEso" bookmarklet
 * (name, image and price read in the owner's browser).
 */
export const POST = handle(
  async (request, { params }: RouteContext<"/api/lists/[id]/items/capture">) => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await params;
    const input = capturedItemSchema.parse(await readJsonBody(request, 16 * 1024));
    const item = await addCapturedItem(getPrisma(), { listId: id, ownerId: user.id }, input);
    return jsonResponse({ item: toOwnerItemDto(item) }, { status: 201 });
  },
);
