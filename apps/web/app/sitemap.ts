import { getPrisma } from "@quieroeso/db";
import { listPublicListsForSitemap } from "@quieroeso/domain";
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** Only PUBLIC lists are listed. Unlisted and private lists never appear here. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lists = await listPublicListsForSitemap(getPrisma());
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    ...lists.map((list) => ({
      url: absoluteUrl(`/l/${list.slug}`),
      lastModified: list.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
