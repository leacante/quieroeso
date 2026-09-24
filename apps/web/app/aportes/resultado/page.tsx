import { getPrisma } from "@quieroeso/db";
import { Card, buttonClassName } from "@quieroeso/ui";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/public-list/auto-refresh";
import { PublicShell } from "@/components/site/public-shell";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Resultado del aporte",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CONTRIBUTION_ID = /^[a-z0-9]{20,40}$/;

/**
 * Mercado Pago return page. It only displays the state confirmed by webhooks;
 * query parameters from the redirect never change financial state.
 */
export default async function ContributionResultPage({ searchParams }: PageProps<"/aportes/resultado">) {
  const { contribution: id } = await searchParams;
  const contribution =
    typeof id === "string" && CONTRIBUTION_ID.test(id)
      ? await getPrisma().contribution.findUnique({
          where: { id },
          select: {
            status: true,
            amountMinor: true,
            listItem: { select: { title: true, list: { select: { slug: true, visibility: true } } } },
          },
        })
      : null;

  const status = contribution?.status;
  const approved = status === "APPROVED";
  const waiting = status === "CREATED" || status === "CHECKOUT_CREATED" || status === "PENDING";
  const list = contribution?.listItem.list;

  return (
    <PublicShell>
      <main id="contenido" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
        <Card className="flex flex-col items-center gap-4 p-8 text-center" data-testid="contribution-result">
          {!contribution ? (
            <>
              <XCircle className="size-12 text-muted-foreground" aria-hidden="true" />
              <h1 className="text-3xl font-bold">No encontramos este aporte</h1>
            </>
          ) : approved ? (
            <>
              <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
              <h1 className="text-3xl font-bold">¡Gracias por tu aporte!</h1>
              <p className="text-muted-foreground">
                Mercado Pago confirmó tu aporte de <strong className="text-foreground">{formatMoney(contribution.amountMinor)}</strong>{" "}
                para “{contribution.listItem.title}”.
              </p>
            </>
          ) : waiting ? (
            <>
              <Clock className="size-12 text-secondary" aria-hidden="true" />
              <h1 className="text-3xl font-bold">Estamos confirmando tu pago</h1>
              <p className="text-muted-foreground" role="status">
                Mercado Pago nos avisa en unos segundos. Si pagaste en efectivo, puede tardar hasta que
                se acredite. Esta página se actualiza sola.
              </p>
              <AutoRefresh />
            </>
          ) : (
            <>
              <XCircle className="size-12 text-destructive" aria-hidden="true" />
              <h1 className="text-3xl font-bold">El pago no se completó</h1>
              <p className="text-muted-foreground">No se cobró nada. Podés intentarlo de nuevo desde la lista.</p>
            </>
          )}
          {list?.visibility === "PUBLIC" ? (
            <Link href={`/l/${list.slug}` as Route} className={buttonClassName({ variant: "secondary" })}>
              Volver a la lista
            </Link>
          ) : contribution ? (
            <p className="text-sm text-muted-foreground">
              Podés volver a la lista desde el enlace que te compartieron.
            </p>
          ) : null}
        </Card>
      </main>
    </PublicShell>
  );
}
