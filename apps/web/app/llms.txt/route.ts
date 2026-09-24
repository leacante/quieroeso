import { getPrisma } from "@quieroeso/db";
import { listPublicListsForSitemap } from "@quieroeso/domain";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Plain-text guide for AI assistants (https://llmstxt.org). Links only to public content. */
export async function GET(): Promise<Response> {
  const lists = await listPublicListsForSitemap(getPrisma(), 200);
  const body = [
    "# QuieroEso",
    "",
    "> QuieroEso es una aplicación argentina para armar listas de deseos con productos de Mercado Libre, compartirlas y, opcionalmente, recibir aportes en dinero por producto a través de Mercado Pago. QuieroEso no custodia fondos: cada aporte se acredita en la cuenta de Mercado Pago de quien armó la lista.",
    "",
    "## Políticas de indexación",
    "",
    "- Sólo las listas públicas (`/l/{slug}`) pueden indexarse o citarse.",
    "- Las listas con enlace secreto (`/s/{token}`) y las privadas no deben indexarse, resumirse ni compartirse.",
    "- Los datos de productos provienen de Mercado Libre y pueden estar desactualizados.",
    "",
    "## Documentación",
    "",
    `- [API pública (OpenAPI)](${absoluteUrl("/openapi.json")}): representación JSON de sólo lectura de listas públicas.`,
    `- [Términos](${absoluteUrl("/terms")})`,
    `- [Privacidad](${absoluteUrl("/privacy")})`,
    "",
    "## Listas públicas",
    "",
    ...(lists.length === 0
      ? ["- Todavía no hay listas públicas."]
      : lists.map(
          (list) =>
            `- [${list.slug}](${absoluteUrl(`/l/${list.slug}`)}): JSON en ${absoluteUrl(`/api/public/lists/${list.slug}`)}`,
        )),
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
