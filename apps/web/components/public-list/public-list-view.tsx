import type { PublicListView } from "@quieroeso/domain";
import { Gift, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { PublicItemCard } from "./public-item-card";
import { ShareButton } from "./share-button";

export function PublicListPage({
  list,
  shareUrl,
  renderAction,
}: {
  list: PublicListView;
  shareUrl: string;
  renderAction?: (itemId: string, itemTitle: string) => ReactNode;
}) {
  return (
    <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-4 border-b-2 border-foreground pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-primary-text">
            <Gift className="size-4" aria-hidden="true" />
            Lista de deseos
          </p>
          <h1 className="text-4xl font-bold break-words sm:text-5xl">{list.title}</h1>
          {list.description ? (
            <p className="max-w-2xl text-lg text-muted-foreground">{list.description}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {list.items.length} {list.items.length === 1 ? "producto" : "productos"}
          </p>
        </div>
        <ShareButton url={shareUrl} title={list.title} />
      </header>

      {list.acceptsContributions ? (
        <p className="mt-6 flex items-start gap-2 rounded-xl border-2 border-success bg-success-soft p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Podés aportar dinero para cualquier producto. El pago se hace en Mercado Pago y se
          acredita directo a quien armó la lista.
        </p>
      ) : null}

      {list.items.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">
          Esta lista todavía no tiene productos.
        </p>
      ) : (
        <section aria-label="Productos" className="mt-8">
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((item, index) => (
              <li key={item.id}>
                <PublicItemCard
                  item={item}
                  acceptsContributions={list.acceptsContributions}
                  action={renderAction?.(item.id, item.title)}
                  priority={index < 3}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
