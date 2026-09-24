"use client";

import { Alert, Button, Card, cn } from "@quieroeso/ui";
import { Check, Copy, Globe, Link2, Lock, MessageCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, errorMessage } from "@/lib/client/api";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/format";

type Visibility = keyof typeof VISIBILITY_LABEL;

const OPTIONS: { value: Visibility; icon: typeof Lock }[] = [
  { value: "PRIVATE", icon: Lock },
  { value: "UNLISTED", icon: Link2 },
  { value: "PUBLIC", icon: Globe },
];

type PublishResponse = {
  shareUrl: string | null;
  list: { publicUrl: string | null };
  promotion: { isPromotional: boolean; freeSlotsAssigned: number };
};

export function PublishPanel({
  listId,
  listTitle,
  visibility,
  shareUrl: initialShareUrl,
  publicUrl: initialPublicUrl,
}: {
  listId: string;
  listTitle: string;
  visibility: Visibility;
  shareUrl: string | null;
  publicUrl: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Visibility>(visibility);
  const [shareUrl, setShareUrl] = useState(initialShareUrl);
  const [publicUrl, setPublicUrl] = useState(initialPublicUrl);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = visibility === "PUBLIC" ? publicUrl : visibility === "UNLISTED" ? shareUrl : null;

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      if (selected === "PRIVATE") {
        await apiRequest("PATCH", `/api/lists/${listId}`, { visibility: "PRIVATE" });
        setMessage({ tone: "success", text: "Listo: la lista ahora es privada." });
      } else {
        const result = await apiRequest<PublishResponse>("POST", `/api/lists/${listId}/publish`, {
          visibility: selected,
        });
        setShareUrl(result.shareUrl);
        setPublicUrl(result.list.publicUrl);
        const promo =
          result.promotion.freeSlotsAssigned > 0
            ? ` ${result.promotion.freeSlotsAssigned} productos quedaron sin comisión.`
            : "";
        setMessage({ tone: "success", text: `¡Lista publicada!${promo}` });
      }
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function rotate() {
    setPending(true);
    try {
      const result = await apiRequest<{ shareUrl: string }>(
        "POST",
        `/api/lists/${listId}/share-link`,
      );
      setShareUrl(result.shareUrl);
      setConfirmRotate(false);
      setMessage({
        tone: "success",
        text: "Generamos un enlace nuevo. El anterior ya no funciona.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-xl font-bold">¿Quién puede ver la lista?</h2>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Visibilidad</legend>
        {OPTIONS.map(({ value, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 transition-colors duration-200 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              selected === value
                ? "border-foreground bg-accent-soft"
                : "border-border-strong bg-card hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2 font-bold">
              <input
                type="radio"
                name="visibility"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                className="size-4 accent-primary"
              />
              <Icon className="size-4" aria-hidden="true" />
              {VISIBILITY_LABEL[value]}
            </span>
            <span className="text-sm text-muted-foreground">{VISIBILITY_HINT[value]}</span>
          </label>
        ))}
      </fieldset>
      <div>
        <Button onClick={save} loading={pending} disabled={selected === visibility}>
          {selected === visibility
            ? "Sin cambios"
            : selected === "PRIVATE"
              ? "Hacer privada"
              : visibility === "PRIVATE"
                ? "Publicar lista"
                : "Guardar visibilidad"}
        </Button>
      </div>

      <div aria-live="polite">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      </div>

      {link ? (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-border-strong p-3">
          <label htmlFor="share-link" className="text-sm font-bold">
            {visibility === "UNLISTED" ? "Enlace secreto para compartir" : "Enlace público"}
          </label>
          <input
            id="share-link"
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full truncate rounded-lg border-2 border-border-strong bg-muted px-3 py-2 font-mono text-sm"
            data-testid="share-link"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={copy}
              icon={
                copied ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )
              }
            >
              {copied ? "¡Copiado!" : "Copiar enlace"}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Mirá mi lista "${listTitle}" en QuieroEso: ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold hover:bg-muted"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Compartir por WhatsApp
            </a>
            {visibility === "UNLISTED" ? (
              confirmRotate ? (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  ¿Invalidar el enlace actual?
                  <Button variant="destructive" size="sm" onClick={rotate} loading={pending}>
                    Sí, generar otro
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRotate(false)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRotate(true)}
                  icon={<RefreshCw className="size-4" aria-hidden="true" />}
                >
                  Generar enlace nuevo
                </Button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
