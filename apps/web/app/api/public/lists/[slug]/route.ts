import { createHash } from "node:crypto";
import { toPublicListJson } from "@/lib/public-metadata";
import { problemResponse } from "@/lib/server/problem";
import { loadPublicList } from "@/lib/server/public-lists";
import { absoluteUrl } from "@/lib/site";

const CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/** Read-only JSON of a PUBLIC list. Unlisted and private lists are indistinguishable from missing ones. */
export async function GET(request: Request, { params }: RouteContext<"/api/public/lists/[slug]">) {
  const { slug } = await params;
  const list = await loadPublicList(slug);
  if (!list) {
    return problemResponse(request, 404, "NOT_FOUND", "No encontramos esa lista.");
  }

  const body = JSON.stringify(toPublicListJson(list, absoluteUrl(`/l/${list.slug}`)));
  const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": CACHE_CONTROL,
    "Access-Control-Allow-Origin": "*",
    Link: `<${absoluteUrl(`/l/${list.slug}`)}>; rel="canonical"`,
  };

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch?.split(",").some((tag) => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
