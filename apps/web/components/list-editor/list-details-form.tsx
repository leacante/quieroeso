"use client";

import { Alert, Button, Card, TextAreaField, TextField } from "@quieroeso/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiRequest, errorMessage } from "@/lib/client/api";

export function ListDetailsForm({
  listId,
  title,
  description,
}: {
  listId: string;
  title: string;
  description: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFields({});
    setMessage(null);
    try {
      await apiRequest("PATCH", `/api/lists/${listId}`, {
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? "").trim() || null,
      });
      setMessage({ tone: "success", text: "Guardamos los cambios." });
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0)
        setFields(caught.fields);
      else setMessage({ tone: "error", text: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    setPending(true);
    try {
      await apiRequest("DELETE", `/api/lists/${listId}`);
      router.push("/dashboard/lists" as Route);
      router.refresh();
    } catch (caught) {
      setPending(false);
      setMessage({ tone: "error", text: errorMessage(caught) });
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-3" noValidate>
        <h2 className="text-xl font-bold">Datos de la lista</h2>
        <TextField
          id="list-title"
          name="title"
          label="Nombre"
          defaultValue={title}
          error={fields.title}
          maxLength={120}
          required
        />
        <TextAreaField
          id="list-description"
          name="description"
          label="Descripción"
          defaultValue={description ?? ""}
          hint="Contá para qué es la lista: cumple, casamiento, mudanza…"
          error={fields.description}
          maxLength={1000}
          optional
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" loading={pending}>
            Guardar
          </Button>
          {confirmArchive ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              ¿Eliminar la lista? Dejará de estar visible.
              <Button variant="destructive" size="sm" onClick={archive} loading={pending}>
                Sí, eliminar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)}>
              Eliminar lista
            </Button>
          )}
        </div>
        <div aria-live="polite">
          {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        </div>
      </form>
    </Card>
  );
}
