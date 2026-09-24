"use client";

import { calculateFeeMinor } from "@quieroeso/domain/money";
import { Alert, Button, TextAreaField, TextField, cn } from "@quieroeso/ui";
import { HandCoins, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "@/lib/client/api";
import { formatMoney, parseMoneyInput } from "@/lib/format";

export type ContributionAccess =
  { type: "public"; slug: string } | { type: "shared"; token: string };

function suggestions(minimum: bigint, remaining: bigint): bigint[] {
  const round = (value: bigint) => (value / 100_000n) * 100_000n; // whole $1.000 steps
  const values = [minimum, round(remaining / 4n), round(remaining / 2n), remaining];
  return [...new Set(values.filter((value) => value >= minimum && value <= remaining))].sort(
    (a, b) => (a < b ? -1 : 1),
  );
}

export function ContributionDialog({
  itemId,
  itemTitle,
  remainingMinor,
  minContributionMinor,
  feeRateBps,
  access,
}: {
  itemId: string;
  itemTitle: string;
  remainingMinor: string;
  minContributionMinor: string;
  feeRateBps: number;
  access: ContributionAccess;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const idempotencyKey = useRef<string | null>(null);
  const remaining = BigInt(remainingMinor);
  const minimum =
    BigInt(minContributionMinor) < remaining ? BigInt(minContributionMinor) : remaining;
  const [amountText, setAmountText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const amountMinor = parseMoneyInput(amountText);
  const amount = amountMinor ? BigInt(amountMinor) : null;
  const fee = amount ? calculateFeeMinor(amount, BigInt(feeRateBps)) : null;

  function open() {
    setError(null);
    setFields({});
    idempotencyKey.current = crypto.randomUUID();
    dialogRef.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!amount || amount < minimum || amount > remaining) {
      setFields({
        amountMinor: `Ingresá un monto entre ${formatMoney(minimum)} y ${formatMoney(remaining)}.`,
      });
      return;
    }
    if (data.get("acceptTerms") !== "on") {
      setFields({ acceptTerms: "Tenés que aceptar los términos para continuar." });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      const result = await apiRequest<{ checkoutUrl: string }>(
        "POST",
        "/api/contributions",
        {
          listItemId: itemId,
          amountMinor: amount.toString(),
          contributorName: String(data.get("contributorName") ?? "").trim() || undefined,
          contributorMessage: String(data.get("contributorMessage") ?? "").trim() || undefined,
          access,
          acceptTerms: true,
        },
        { "Idempotency-Key": idempotencyKey.current ?? crypto.randomUUID() },
      );
      window.location.assign(result.checkoutUrl);
    } catch (caught) {
      setPending(false);
      if (
        caught instanceof ApiError &&
        Object.keys(caught.fields).length > 0 &&
        caught.code !== "VALIDATION_FAILED"
      ) {
        setFields(caught.fields);
      } else {
        setError(caught instanceof ApiError ? caught.message : "No pudimos iniciar el pago.");
      }
    }
  }

  return (
    <>
      <Button
        className="w-full"
        onClick={open}
        icon={<HandCoins className="size-5" aria-hidden="true" />}
      >
        Aportar
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border-2 border-foreground bg-card p-0 text-card-foreground shadow-block backdrop:bg-foreground/60"
      >
        <form onSubmit={submit} className="flex flex-col gap-4 p-5" noValidate>
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-2xl font-bold">
              Aportar para {itemTitle}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Cerrar"
              onClick={() => dialogRef.current?.close()}
              icon={<X className="size-5" aria-hidden="true" />}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Falta juntar <strong className="text-foreground">{formatMoney(remaining)}</strong>.
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold">Elegí un monto</legend>
            <div className="flex flex-wrap gap-2">
              {suggestions(minimum, remaining).map((value) => (
                <button
                  key={value.toString()}
                  type="button"
                  onClick={() => setAmountText((Number(value) / 100).toString())}
                  className={cn(
                    "min-h-11 rounded-xl border-2 px-3 text-sm font-bold transition-colors duration-200",
                    amount === value
                      ? "border-foreground bg-accent-soft"
                      : "border-border-strong hover:bg-muted",
                  )}
                >
                  {formatMoney(value)}
                </button>
              ))}
            </div>
          </fieldset>
          <TextField
            id={`amount-${itemId}`}
            label="Monto del aporte"
            inputMode="decimal"
            placeholder={(Number(minimum) / 100).toString()}
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            hint={`Mínimo ${formatMoney(minimum)}.`}
            error={fields.amountMinor}
            autoFocus
            required
          />
          <TextField
            id={`name-${itemId}`}
            name="contributorName"
            label="Tu nombre"
            hint="Lo verá quien armó la lista."
            maxLength={80}
            optional
            autoComplete="name"
          />
          <TextAreaField
            id={`message-${itemId}`}
            name="contributorMessage"
            label="Mensaje"
            maxLength={280}
            optional
          />

          <div
            className="rounded-xl border-2 border-border-strong bg-muted p-3 text-sm"
            aria-live="polite"
          >
            <p className="flex justify-between gap-2">
              <span>Tu aporte</span>
              <strong>{amount ? formatMoney(amount) : "—"}</strong>
            </p>
            <p className="flex justify-between gap-2 text-muted-foreground">
              <span>Comisión de QuieroEso ({feeRateBps / 100}%)</span>
              <span>{fee !== null ? formatMoney(fee) : "—"}</span>
            </p>
            <p className="mt-2 text-muted-foreground">
              La comisión se descuenta de lo que recibe quien armó la lista. Mercado Pago puede
              aplicar sus propios cargos. El pago lo procesa Mercado Pago: QuieroEso no guarda datos
              de tu tarjeta.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="acceptTerms"
                className="mt-1 size-5 shrink-0 accent-primary"
                aria-invalid={fields.acceptTerms ? true : undefined}
                aria-describedby={fields.acceptTerms ? `terms-error-${itemId}` : undefined}
              />
              <span>
                Acepto los{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-semibold underline underline-offset-2"
                >
                  términos
                </Link>{" "}
                y la{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-semibold underline underline-offset-2"
                >
                  política de privacidad
                </Link>
                .
              </span>
            </label>
            {fields.acceptTerms ? (
              <p id={`terms-error-${itemId}`} className="text-sm font-semibold text-destructive">
                {fields.acceptTerms}
              </p>
            ) : null}
          </div>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            icon={<ShieldCheck className="size-5" aria-hidden="true" />}
          >
            Ir a pagar con Mercado Pago
          </Button>
        </form>
      </dialog>
    </>
  );
}
