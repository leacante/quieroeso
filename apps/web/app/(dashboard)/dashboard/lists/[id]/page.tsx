import { getPrisma } from "@quieroeso/db";
import { DomainError, getOwnedList, getShareToken, previewFeeRates } from "@quieroeso/domain";
import { Alert } from "@quieroeso/ui";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddItemPanel } from "@/components/list-editor/add-item-panel";
import { EditorItemList } from "@/components/list-editor/editor-item-list";
import { FundingModePanel } from "@/components/list-editor/funding-mode-panel";
import { ListDetailsForm } from "@/components/list-editor/list-details-form";
import { PublishPanel } from "@/components/list-editor/publish-panel";
import { VisibilityBadge } from "@/components/list-editor/visibility-badge";
import { getListDeps } from "@/lib/server/services";
import { absoluteUrl } from "@/lib/site";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Editar lista" };

async function loadList(listId: string, ownerId: string) {
  try {
    return await getOwnedList(getPrisma(), { listId, ownerId });
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

function FeeBanner({ reason, freeSlotsRemaining }: { reason: string; freeSlotsRemaining: number }) {
  if (reason === "FIRST_PUBLICATION_PENDING") {
    return (
      <Alert tone="success" className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>Tu primera lista publicada tiene 8 productos sin comisión.</strong> Si publicás
          esta lista, los primeros 8 productos quedan al 0%; el resto, al 1%.
        </span>
      </Alert>
    );
  }
  if (reason === "PROMOTIONAL_LIST") {
    return (
      <Alert tone="success" className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Esta es tu lista con beneficio.{" "}
          {freeSlotsRemaining > 0
            ? `Te quedan ${freeSlotsRemaining} ${freeSlotsRemaining === 1 ? "cupo" : "cupos"} sin comisión para los próximos productos.`
            : "Ya usaste los 8 cupos sin comisión."}
        </span>
      </Alert>
    );
  }
  return (
    <Alert tone="info">
      Los aportes a esta lista tienen una comisión de plataforma del 1%, además de los cargos de
      Mercado Pago.
    </Alert>
  );
}

export default async function EditListPage({ params }: PageProps<"/dashboard/lists/[id]">) {
  const { id } = await params;
  const user = await requirePageUser(`/dashboard/lists/${id}`);
  const db = getPrisma();
  const list = await loadList(id, user.id);
  const [preview, connection, shareToken] = await Promise.all([
    previewFeeRates(db, { ownerId: user.id, listId: list.id }),
    db.mercadoPagoConnection.findUnique({ where: { userId: user.id }, select: { status: true } }),
    getShareToken(getListDeps(), { listId: list.id, ownerId: user.id }),
  ]);

  const items = list.items.map((item) => ({
    id: item.id,
    title: item.title,
    notes: item.notes,
    imageUrl: item.imageUrl,
    sourceUrl: item.sourceUrl,
    sourceType: item.sourceType,
    priceMinor: item.priceMinor?.toString() ?? null,
    targetAmountMinor: item.targetAmountMinor?.toString() ?? null,
    availability: item.availability,
    feeRateBps: preview.ratesByItemId.get(item.id) ?? item.feeRateBps,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={"/dashboard/lists" as Route}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold underline-offset-2 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mis listas
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold break-words sm:text-4xl">{list.title}</h1>
          <VisibilityBadge visibility={list.visibility} />
        </div>
      </div>

      <FeeBanner reason={preview.reason} freeSlotsRemaining={preview.freeSlotsRemaining} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <AddItemPanel listId={list.id} />
          <section aria-labelledby="items-heading" className="flex flex-col gap-3">
            <h2 id="items-heading" className="text-2xl font-bold">
              Productos <span className="text-muted-foreground">({items.length})</span>
            </h2>
            <EditorItemList listId={list.id} items={items} />
          </section>
        </div>
        <aside className="flex flex-col gap-6" aria-label="Configuración de la lista">
          <PublishPanel
            listId={list.id}
            listTitle={list.title}
            visibility={list.visibility}
            shareUrl={shareToken ? absoluteUrl(`/s/${shareToken}`) : null}
            publicUrl={list.visibility === "PUBLIC" ? absoluteUrl(`/l/${list.slug}`) : null}
          />
          <FundingModePanel
            listId={list.id}
            fundingMode={list.fundingMode}
            mercadoPagoConnected={connection?.status === "ACTIVE"}
          />
          <ListDetailsForm listId={list.id} title={list.title} description={list.description} />
        </aside>
      </div>
    </div>
  );
}
