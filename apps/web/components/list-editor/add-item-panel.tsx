"use client";

import { Alert, Button, Card, TextAreaField, TextField, cn } from "@quieroeso/ui";
import { Link2, PencilLine, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "@/lib/client/api";
import { parseMoneyInput } from "@/lib/format";

type Mode = "import" | "manual";

export function AddItemPanel({ listId }: { listId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("import");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  async function run(action: () => Promise<{ item: { title: string } }>, form: HTMLFormElement) {
    setPending(true);
    setError(null);
    setFields({});
    setSuccess(null);
    try {
      const { item } = await action();
      form.reset();
      setSuccess(`Agregamos "${item.title}".`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0)
        setFields(caught.fields);
      else
        setError(caught instanceof ApiError ? caught.message : "No pudimos agregar el producto.");
    } finally {
      setPending(false);
    }
  }

  function importItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(
      () =>
        apiRequest("POST", `/api/lists/${listId}/items/import`, {
          url: String(data.get("url") ?? ""),
        }),
      event.currentTarget,
    );
  }

  function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const priceText = String(data.get("price") ?? "").trim();
    const priceMinor = priceText ? parseMoneyInput(priceText) : null;
    if (priceText && !priceMinor) {
      setFields({ priceMinor: "Ingresá un monto válido, por ejemplo 15.000." });
      return;
    }
    const sourceUrl = String(data.get("sourceUrl") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim();
    void run(
      () =>
        apiRequest("POST", `/api/lists/${listId}/items`, {
          title: String(data.get("title") ?? ""),
          ...(priceMinor ? { priceMinor } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(notes ? { notes } : {}),
        }),
      event.currentTarget,
    );
  }

  const tabs: { id: Mode; label: string; icon: typeof Link2 }[] = [
    { id: "import", label: "Desde Mercado Libre", icon: Link2 },
    { id: "manual", label: "Cargar a mano", icon: PencilLine },
  ];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-xl font-bold">Agregar un producto</h2>
      <div role="tablist" aria-label="Forma de agregar" className="flex gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={mode === id}
            aria-controls={`panel-${id}`}
            onClick={() => {
              setMode(id);
              setError(null);
              setFields({});
            }}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-colors duration-200",
              mode === id
                ? "border-foreground bg-foreground text-background"
                : "border-border-strong hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {mode === "import" ? (
        <form
          id="panel-import"
          role="tabpanel"
          aria-labelledby="tab-import"
          onSubmit={importItem}
          className="flex flex-col gap-3"
          noValidate
        >
          <TextField
            id="import-url"
            name="url"
            type="url"
            inputMode="url"
            label="Enlace del producto"
            placeholder="https://articulo.mercadolibre.com.ar/MLA-…"
            hint="Copiá el enlace desde la app o la web de Mercado Libre. También sirven los enlaces meli.la."
            error={fields.url}
            required
            autoComplete="off"
          />
          <div>
            <Button
              type="submit"
              loading={pending}
              icon={<Plus className="size-5" aria-hidden="true" />}
            >
              Agregar producto
            </Button>
          </div>
        </form>
      ) : (
        <form
          id="panel-manual"
          role="tabpanel"
          aria-labelledby="tab-manual"
          onSubmit={addManual}
          className="grid gap-3 sm:grid-cols-2"
          noValidate
        >
          <TextField
            id="manual-title"
            name="title"
            label="Nombre"
            error={fields.title}
            required
            maxLength={200}
            className="sm:col-span-2"
          />
          <TextField
            id="manual-price"
            name="price"
            label="Precio aproximado"
            inputMode="decimal"
            placeholder="15.000"
            error={fields.priceMinor}
            optional
          />
          <TextField
            id="manual-url"
            name="sourceUrl"
            type="url"
            label="Enlace"
            placeholder="https://…"
            error={fields.sourceUrl}
            optional
          />
          <TextAreaField
            id="manual-notes"
            name="notes"
            label="Notas"
            error={fields.notes}
            optional
            maxLength={500}
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button
              type="submit"
              loading={pending}
              icon={<Plus className="size-5" aria-hidden="true" />}
            >
              Agregar producto
            </Button>
          </div>
        </form>
      )}

      <div aria-live="polite">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {success ? <Alert tone="success">{success}</Alert> : null}
      </div>
    </Card>
  );
}
