import { getPrisma } from "@quieroeso/db";
import { listOwnedLists } from "@quieroeso/domain";
import { Badge, Card } from "@quieroeso/ui";
import { Gift, HandCoins, Sparkles } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CreateListForm } from "@/components/list-editor/create-list-form";
import { VisibilityBadge } from "@/components/list-editor/visibility-badge";
import { formatDate } from "@/lib/format";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Mis listas" };

export default async function ListsPage() {
  const user = await requirePageUser("/dashboard/lists");
  const lists = await listOwnedLists(getPrisma(), user.id);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="lists-heading" className="flex flex-col gap-2">
        <h1 id="lists-heading" className="text-3xl font-bold sm:text-4xl">
          Hola, {user.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          Armá una lista, sumale productos y compartila cuando esté lista.
        </p>
      </section>

      <Card className="p-4 sm:p-6">
        <CreateListForm />
      </Card>

      {lists.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Gift className="size-12 text-primary" aria-hidden="true" />
          <h2 className="text-2xl font-bold">Todavía no tenés listas</h2>
          <p className="max-w-md text-muted-foreground">
            Tu primera lista publicada tiene{" "}
            <strong className="text-foreground">8 productos sin comisión</strong> cuando recibas
            aportes.
          </p>
        </Card>
      ) : (
        <section aria-labelledby="my-lists">
          <h2 id="my-lists" className="sr-only">
            Tus listas
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <li key={list.id}>
                <Link
                  href={`/dashboard/lists/${list.id}` as Route}
                  className="group block h-full rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Card className="flex h-full flex-col gap-3 p-5 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <VisibilityBadge visibility={list.visibility} />
                      {list.fundingMode === "PER_ITEM" ? (
                        <Badge tone="warning">
                          <HandCoins className="size-3.5" aria-hidden="true" />
                          Aportes
                        </Badge>
                      ) : null}
                      {list.isPromotional ? (
                        <Badge tone="primary">
                          <Sparkles className="size-3.5" aria-hidden="true" />
                          Sin comisión
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="text-xl font-bold group-hover:underline">{list.title}</h3>
                    <p className="mt-auto text-sm text-muted-foreground">
                      {list.itemCount} {list.itemCount === 1 ? "producto" : "productos"} ·
                      actualizada el {formatDate(list.updatedAt)}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
