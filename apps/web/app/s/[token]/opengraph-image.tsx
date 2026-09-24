import { OG_SIZE, renderListOgImage } from "@/lib/server/og-image";
import { loadSharedList } from "@/lib/server/public-lists";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Vista previa de la lista en QuieroEso";

/** Preview for chat apps; the image is only reachable by whoever already has the secret link. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const list = await loadSharedList(token);
  return renderListOgImage(list && list.visibility === "UNLISTED" ? list : null);
}
