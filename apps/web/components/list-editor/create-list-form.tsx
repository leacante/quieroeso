"use client";

import { Alert, Button, TextField } from "@quieroeso/ui";
import { Plus } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "@/lib/client/api";

export function CreateListForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldError(undefined);
    try {
      const { list } = await apiRequest<{ list: { id: string } }>("POST", "/api/lists", { title });
      router.push(`/dashboard/lists/${list.id}` as Route);
    } catch (caught) {
      setPending(false);
      if (caught instanceof ApiError && caught.fields.title) setFieldError(caught.fields.title);
      else setError(caught instanceof ApiError ? caught.message : "No pudimos crear la lista.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <TextField
        id="new-list-title"
        label="Nombre de la nueva lista"
        placeholder="Ej.: Mi cumple 30"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldError}
        maxLength={120}
        required
        className="flex-1"
      />
      <Button type="submit" loading={pending} icon={<Plus className="size-5" aria-hidden="true" />}>
        Crear lista
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </form>
  );
}
