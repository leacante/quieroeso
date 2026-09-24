import { getPrisma } from "@quieroeso/db";
import { listOwnerContributions } from "@quieroeso/domain";
import { Badge, Card } from "@quieroeso/ui";
import { HandCoins } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Aportes" };

const STATUS = {
  PENDING: { label: "Pendiente", tone: "warning" },
  APPROVED: { label: "Acreditado", tone: "success" },
  REJECTED: { label: "Rechazado", tone: "neutral" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
  CHARGED_BACK: { label: "Contracargo", tone: "warning" },
  CREATED: { label: "Iniciado", tone: "neutral" },
  CHECKOUT_CREATED: { label: "Iniciado", tone: "neutral" },
} as const;

export default async function ContributionsPage() {
  const user = await requirePageUser("/dashboard/contributions");
  const { contributions, totals } = await listOwnerContributions(getPrisma(), user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-3xl font-bold sm:text-4xl">
        <HandCoins className="size-8" aria-hidden="true" />
        Aportes
      </h1>

      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Aportes acreditados",
            value: String(totals.approvedCount),
            testId: "total-count",
          },
          {
            label: "Total recibido",
            value: formatMoney(totals.approvedMinor),
            testId: "total-amount",
          },
          {
            label: "Comisiones de QuieroEso",
            value: formatMoney(totals.platformFeesMinor),
            testId: "total-fees",
          },
        ].map((stat) => (
          <Card key={stat.label} className="flex flex-col gap-1 p-4">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="font-heading text-3xl font-bold" data-testid={stat.testId}>
              {stat.value}
            </dd>
          </Card>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Los montos son brutos: Mercado Pago descuenta sus cargos y la comisión de plataforma al
        acreditar. Los reembolsos se gestionan desde tu cuenta de Mercado Pago.
      </p>

      {contributions.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Todavía no recibiste aportes. Habilitá los aportes en una lista y compartila.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-160 text-left text-sm">
            <caption className="sr-only">Historial de aportes</caption>
            <thead className="border-b-2 border-foreground bg-muted">
              <tr>
                <th scope="col" className="p-3">
                  Fecha
                </th>
                <th scope="col" className="p-3">
                  Producto
                </th>
                <th scope="col" className="p-3">
                  De
                </th>
                <th scope="col" className="p-3 text-right">
                  Monto
                </th>
                <th scope="col" className="p-3 text-right">
                  Comisión
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border align-top"
                  data-testid="contribution-row"
                >
                  <td className="p-3 whitespace-nowrap">
                    {formatDate(row.approvedAt ?? row.createdAt)}
                  </td>
                  <td className="p-3">
                    <span className="font-semibold">{row.listItem.title}</span>
                    <br />
                    <Link
                      href={`/dashboard/lists/${row.listItem.list.id}` as Route}
                      className="text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {row.listItem.list.title}
                    </Link>
                  </td>
                  <td className="p-3">
                    {row.contributorName ?? <span className="text-muted-foreground">Anónimo</span>}
                    {row.contributorMessage ? (
                      <p className="mt-1 max-w-xs text-muted-foreground">
                        “{row.contributorMessage}”
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 text-right font-semibold whitespace-nowrap">
                    {formatMoney(row.amountMinor)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap text-muted-foreground">
                    {formatMoney(row.platformFeeAmountMinor)} ({row.platformFeeRateBps / 100}%)
                  </td>
                  <td className="p-3">
                    <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
