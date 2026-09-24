"use client";

import { Alert, Button, Card, buttonClassName } from "@quieroeso/ui";
import { HandCoins, Heart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, errorMessage } from "@/lib/client/api";

export function FundingModePanel({
  listId,
  fundingMode,
  mercadoPagoConnected,
}: {
  listId: string;
  fundingMode: "WISHLIST" | "PER_ITEM";
  mercadoPagoConnected: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perItem = fundingMode === "PER_ITEM";

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await apiRequest("PATCH", `/api/lists/${listId}`, {
        fundingMode: perItem ? "WISHLIST" : "PER_ITEM",
      });
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {perItem ? (
          <HandCoins className="size-5" aria-hidden="true" />
        ) : (
          <Heart className="size-5" aria-hidden="true" />
        )}
        {perItem ? "Recibís aportes por producto" : "Lista de deseos"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {perItem
          ? "Quienes vean la lista pueden aportar dinero para cada producto. El dinero llega directo a tu cuenta de Mercado Pago."
          : "Quienes vean la lista ven los productos y el enlace para comprarlos. Podés habilitar aportes en dinero cuando quieras."}
      </p>
      {!perItem && !mercadoPagoConnected ? (
        <>
          <Alert tone="info">
            Para recibir aportes, primero conectá tu cuenta de Mercado Pago.
          </Alert>
          <Link
            href="/dashboard/mercadopago"
            className={buttonClassName({ variant: "secondary", size: "sm", className: "w-fit" })}
          >
            Conectar Mercado Pago
          </Link>
        </>
      ) : (
        <div>
          <Button
            variant={perItem ? "secondary" : "primary"}
            size="sm"
            onClick={toggle}
            loading={pending}
          >
            {perItem ? "Volver a lista de deseos" : "Habilitar aportes"}
          </Button>
        </div>
      )}
      {perItem ? (
        <p className="text-sm text-muted-foreground">
          Si volvés a lista de deseos, se ocultan los botones de aporte pero se conserva el
          historial.
        </p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Card>
  );
}
