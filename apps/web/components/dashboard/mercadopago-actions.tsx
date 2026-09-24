"use client";

import { Alert, Button } from "@quieroeso/ui";
import { Link2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, errorMessage } from "@/lib/client/api";

export function MercadoPagoActions({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const { authorizationUrl } = await apiRequest<{ authorizationUrl: string }>(
        "POST",
        "/api/integrations/mercadopago/connect",
      );
      window.location.assign(authorizationUrl);
    } catch (caught) {
      setPending(false);
      setError(errorMessage(caught));
    }
  }

  async function disconnect() {
    setPending(true);
    try {
      await apiRequest("POST", "/api/integrations/mercadopago/disconnect");
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={connect}
          loading={pending && !confirm}
          icon={<Link2 className="size-5" aria-hidden="true" />}
        >
          {connected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
        </Button>
        {connected ? (
          confirm ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              ¿Desconectar? Tus listas dejarán de aceptar aportes.
              <Button variant="destructive" size="sm" onClick={disconnect} loading={pending}>
                Sí, desconectar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirm(true)}
              icon={<Unlink className="size-5" aria-hidden="true" />}
            >
              Desconectar
            </Button>
          )
        ) : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
