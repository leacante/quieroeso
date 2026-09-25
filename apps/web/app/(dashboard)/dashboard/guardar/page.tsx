import { getPrisma } from "@quieroeso/db";
import { listOwnedLists } from "@quieroeso/domain";
import { Alert, buttonClassName } from "@quieroeso/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { CaptureForm } from "@/components/capture/capture-form";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Guardar producto" };

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** "45999", "45999.5" or "45999.00" (schema.org decimal) to minor units. */
function decimalToMinor(value: string): string | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match?.[1]) return null;
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return minor > 0n ? minor.toString() : null;
}

/** Landing page of the "Guardar en QuieroEso" bookmarklet: review and pick a list. */
export default async function SaveCapturedProductPage({
  searchParams,
}: PageProps<"/dashboard/guardar">) {
  const query = await searchParams;
  const user = await requirePageUser("/dashboard/guardar");
  const url = param(query.url);
  const lists = await listOwnedLists(getPrisma(), user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Guardar producto</h1>
        <p className="text-muted-foreground">
          Revisá los datos que tomamos de Mercado Libre y elegí a qué lista sumarlo.
        </p>
      </div>
      {!url ? (
        <Alert tone="info">
          Abrí un producto en Mercado Libre y tocá el botón «Guardar en QuieroEso» de tu barra de
          favoritos.
        </Alert>
      ) : lists.length === 0 ? (
        <>
          <Alert tone="info">Primero creá una lista para poder guardar productos.</Alert>
          <Link href="/dashboard/lists" className={buttonClassName({ className: "w-fit" })}>
            Ir a mis listas
          </Link>
        </>
      ) : (
        <CaptureForm
          url={url}
          title={param(query.title).slice(0, 200)}
          imageUrl={param(query.image)}
          priceMinor={decimalToMinor(param(query.price))}
          lists={lists.map((list) => ({ id: list.id, title: list.title }))}
        />
      )}
    </div>
  );
}
