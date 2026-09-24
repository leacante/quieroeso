import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { contributionAction } from "@/components/public-list/contribution-action";
import { PublicListPage } from "@/components/public-list/public-list-view";
import { listDescription } from "@/lib/public-metadata";
import { loadSharedList } from "@/lib/server/public-lists";
import { absoluteUrl } from "@/lib/site";

/** Secret-link lists are never indexed, cached publicly or given a canonical URL. */
const NO_INDEX = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const list = await loadSharedList(token);
  if (!list) return { title: "Lista no encontrada", robots: NO_INDEX };
  const description = listDescription(list);
  return {
    title: list.title,
    description,
    robots: NO_INDEX,
    referrer: "no-referrer",
    // Preview for WhatsApp and social apps; og:url is omitted so the secret URL is not repeated.
    openGraph: { type: "website", title: list.title, description, locale: "es_AR" },
    twitter: { card: "summary_large_image", title: list.title, description },
  };
}

export default async function SharedListRoute({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const list = await loadSharedList(token);
  if (!list) notFound();
  if (list.visibility === "PUBLIC") redirect(`/l/${list.slug}` as Route);
  return (
    <PublicListPage
      list={list}
      shareUrl={absoluteUrl(`/s/${token}`)}
      renderAction={contributionAction(list, { type: "shared", token })}
    />
  );
}
