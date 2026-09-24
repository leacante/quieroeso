import { OG_SIZE, renderListOgImage } from "@/lib/server/og-image";
import { loadPublicList } from "@/lib/server/public-lists";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Vista previa de la lista en QuieroEso";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderListOgImage(await loadPublicList(slug));
}
