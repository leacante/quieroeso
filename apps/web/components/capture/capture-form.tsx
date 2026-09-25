"use client";

import { Alert, Button, Card, SelectField, TextField, buttonClassName } from "@quieroeso/ui";
import { ExternalLink, Plus } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ProductImage } from "@/components/product-image";
import { ApiError, apiRequest } from "@/lib/client/api";
import { formatMoney, parseMoneyInput } from "@/lib/format";

/** next/image only serves Mercado Libre's CDN; anything else is not previewed or sent. */
function mercadoLibreImage(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".mlstatic.com") ? value : null;
  } catch {
    return null;
  }
}

/** The link comes from the query string: only https Mercado Libre pages are rendered. */
function mercadoLibrePage(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const ours = host === "mercadolibre.com.ar" || host.endsWith(".mercadolibre.com.ar");
    return url.protocol === "https:" && ours ? url.toString() : null;
  } catch {
    return null;
  }
}

export function CaptureForm({
  url,
  title,
  imageUrl,
  priceMinor,
  lists,
}: {
  url: string;
  title: string;
  imageUrl: string;
  priceMinor: string | null;
  lists: { id: string; title: string }[];
}) {
  const image = mercadoLibreImage(imageUrl);
  const sourceLink = mercadoLibrePage(url);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{ listId: string; title: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const listId = String(data.get("listId") ?? "");
    const priceText = String(data.get("price") ?? "").trim();
    const price = priceText ? parseMoneyInput(priceText) : null;
    if (priceText && !price) {
      setFields({ priceMinor: "Ingresá un monto válido, por ejemplo 15.000." });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      const { item } = await apiRequest<{ item: { title: string } }>(
        "POST",
        `/api/lists/${listId}/items/capture`,
        {
          url,
          title: String(data.get("title") ?? ""),
          ...(image ? { imageUrl: image } : {}),
          ...(price ? { priceMinor: price } : {}),
        },
      );
      setSaved({ listId, title: item.title });
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0)
        setFields(caught.fields);
      else
        setError(caught instanceof ApiError ? caught.message : "No pudimos guardar el producto.");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <Alert tone="success">Guardamos “{saved.title}” en tu lista.</Alert>
        <Link
          href={`/dashboard/lists/${saved.listId}` as Route}
          className={buttonClassName({ className: "w-fit" })}
        >
          Ver la lista
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <ProductImage src={image} alt={title || "Producto"} sizes="160px" priority />
        <form onSubmit={save} className="flex flex-col gap-3" noValidate>
          <TextField
            id="capture-title"
            name="title"
            label="Nombre"
            defaultValue={title}
            error={fields.title}
            required
            maxLength={200}
          />
          <TextField
            id="capture-price"
            name="price"
            label="Precio"
            inputMode="decimal"
            placeholder="15.000"
            defaultValue={priceMinor ? (formatMoney(priceMinor) ?? "").replace("$ ", "") : ""}
            hint="Lo usamos como objetivo si la lista recibe aportes."
            error={fields.priceMinor}
            optional
          />
          <SelectField id="capture-list" name="listId" label="Lista" required>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.title}
              </option>
            ))}
          </SelectField>
          {fields.url ? <Alert tone="error">{fields.url}</Alert> : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              loading={pending}
              icon={<Plus className="size-5" aria-hidden="true" />}
            >
              Guardar en la lista
            </Button>
            {sourceLink ? (
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2"
              >
                Ver en Mercado Libre <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </a>
            ) : null}
          </div>
        </form>
      </div>
    </Card>
  );
}
