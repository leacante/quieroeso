"use client";

import { Alert, Badge, Button, Card, TextAreaField, TextField } from "@quieroeso/ui";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ProductImage } from "@/components/product-image";
import { ApiError, apiRequest, errorMessage } from "@/lib/client/api";
import { feeLabel, formatMoney, parseMoneyInput } from "@/lib/format";

export type EditorItem = {
  id: string;
  title: string;
  notes: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceType: "MERCADOLIBRE" | "MANUAL";
  priceMinor: string | null;
  targetAmountMinor: string | null;
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  feeRateBps: number;
};

export function EditorItemCard({
  listId,
  item,
  index,
  total,
  onMove,
  moving,
}: {
  listId: string;
  item: EditorItem;
  index: number;
  total: number;
  onMove: (index: number, direction: -1 | 1) => void;
  moving: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const endpoint = `/api/lists/${listId}/items/${item.id}`;

  async function mutate(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    setFields({});
    try {
      await action();
      setEditing(false);
      setConfirmDelete(false);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0)
        setFields(caught.fields);
      else setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetText = String(data.get("target") ?? "").trim();
    const targetAmountMinor = targetText ? parseMoneyInput(targetText) : null;
    if (targetText && !targetAmountMinor) {
      setFields({ targetAmountMinor: "Ingresá un monto válido, por ejemplo 15.000." });
      return;
    }
    const imageUrl = String(data.get("imageUrl") ?? "").trim();
    void mutate(() =>
      apiRequest("PATCH", endpoint, {
        title: String(data.get("title") ?? ""),
        notes: String(data.get("notes") ?? "").trim() || null,
        imageUrl: imageUrl || null,
        targetAmountMinor,
      }),
    );
  }

  const price = formatMoney(item.priceMinor);
  const target = formatMoney(item.targetAmountMinor);

  return (
    <Card className="flex flex-wrap gap-4 p-4 sm:flex-nowrap" data-testid="editor-item">
      <ProductImage
        src={item.imageUrl}
        alt=""
        className="w-20 shrink-0 self-start sm:w-32"
        sizes="128px"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={item.feeRateBps === 0 ? "success" : "neutral"} data-testid="fee-badge">
            {feeLabel(item.feeRateBps)}
          </Badge>
          {item.availability === "UNAVAILABLE" ? (
            <Badge tone="warning">No disponible en Mercado Libre</Badge>
          ) : null}
        </div>
        {editing ? (
          <form onSubmit={save} className="grid gap-3" noValidate>
            <TextField
              id={`title-${item.id}`}
              name="title"
              label="Nombre"
              defaultValue={item.title}
              error={fields.title}
              maxLength={200}
              required
            />
            <TextField
              id={`target-${item.id}`}
              name="target"
              label="Objetivo de aportes"
              inputMode="decimal"
              defaultValue={
                item.targetAmountMinor
                  ? (formatMoney(item.targetAmountMinor) ?? "").replace("$ ", "")
                  : ""
              }
              hint="Cuánto querés juntar para este producto."
              error={fields.targetAmountMinor}
              optional
            />
            <TextField
              id={`image-${item.id}`}
              name="imageUrl"
              type="url"
              label="Imagen (URL https)"
              defaultValue={item.imageUrl ?? ""}
              error={fields.imageUrl}
              optional
            />
            <TextAreaField
              id={`notes-${item.id}`}
              name="notes"
              label="Notas"
              defaultValue={item.notes ?? ""}
              error={fields.notes}
              maxLength={500}
              optional
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={pending}>
                Guardar cambios
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              {item.sourceType === "MERCADOLIBRE" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="size-4" aria-hidden="true" />}
                  onClick={() =>
                    void mutate(() => apiRequest("PATCH", endpoint, { resetToSource: true }))
                  }
                >
                  Usar datos de Mercado Libre
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <>
            <h3 className="text-lg font-bold break-words">{item.title}</h3>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {price ? (
                <div className="flex gap-1">
                  <dt>Precio:</dt>
                  <dd className="font-semibold text-foreground">{price}</dd>
                </div>
              ) : null}
              {target ? (
                <div className="flex gap-1">
                  <dt>Objetivo:</dt>
                  <dd className="font-semibold text-foreground">{target}</dd>
                </div>
              ) : null}
            </dl>
            {item.notes ? <p className="text-sm">{item.notes}</p> : null}
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex w-fit items-center gap-1 text-sm font-semibold underline underline-offset-2"
              >
                Ver publicación <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            ) : null}
          </>
        )}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      {!editing ? (
        <div className="flex w-full shrink-0 flex-row flex-wrap items-start gap-1 sm:w-auto sm:flex-col">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Subir ${item.title}`}
            disabled={index === 0 || moving}
            onClick={() => onMove(index, -1)}
            icon={<ArrowUp className="size-4" aria-hidden="true" />}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Bajar ${item.title}`}
            disabled={index === total - 1 || moving}
            onClick={() => onMove(index, 1)}
            icon={<ArrowDown className="size-4" aria-hidden="true" />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            icon={<Pencil className="size-4" aria-hidden="true" />}
          >
            Editar
          </Button>
          {confirmDelete ? (
            <span className="flex flex-col gap-1 text-sm">
              <span>¿Eliminar?</span>
              <Button
                variant="destructive"
                size="sm"
                loading={pending}
                onClick={() => void mutate(() => apiRequest("DELETE", endpoint))}
              >
                Sí, eliminar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              icon={<Trash2 className="size-4" aria-hidden="true" />}
            >
              Eliminar
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
