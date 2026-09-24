import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contributionAction } from "@/components/public-list/contribution-action";
import { PublicListPage } from "@/components/public-list/public-list-view";
import { buildItemListJsonLd, jsonLdScript, listDescription } from "@/lib/public-metadata";
import { loadPublicList } from "@/lib/server/public-lists";
import { absoluteUrl } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/l/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const list = await loadPublicList(slug);
  if (!list) return { title: "Lista no encontrada", robots: { index: false, follow: false } };
  const url = absoluteUrl(`/l/${list.slug}`);
  const description = listDescription(list);
  return {
    title: list.title,
    description,
    alternates: {
      canonical: url,
      types: { "application/json": absoluteUrl(`/api/public/lists/${list.slug}`) },
    },
    openGraph: { type: "website", url, title: list.title, description, locale: "es_AR" },
    twitter: { card: "summary_large_image", title: list.title, description },
  };
}

export default async function PublicListRoute({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const list = await loadPublicList(slug);
  if (!list) notFound();
  const url = absoluteUrl(`/l/${list.slug}`);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildItemListJsonLd(list, url)) }}
      />
      <PublicListPage
        list={list}
        shareUrl={url}
        renderAction={contributionAction(list, { type: "public", slug: list.slug })}
      />
    </>
  );
}
