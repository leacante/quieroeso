import { getPrisma } from "@quieroeso/db";
import { getConnectionStatus } from "@quieroeso/domain";
import { Alert, Badge, Card } from "@quieroeso/ui";
import { CheckCircle2, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { MercadoPagoActions } from "@/components/dashboard/mercadopago-actions";
import { formatDate } from "@/lib/format";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Mercado Pago" };

const RESULT_MESSAGES: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  connected: { tone: "success", text: "¡Listo! Tu cuenta de Mercado Pago quedó conectada." },
  denied: { tone: "info", text: "Cancelaste la conexión. Podés intentarlo cuando quieras." },
  expired: { tone: "error", text: "El enlace de conexión venció o ya se usó. Probá de nuevo." },
  "in-use": { tone: "error", text: "Esa cuenta de Mercado Pago ya está conectada a otro usuario." },
  error: {
    tone: "error",
    text: "No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.",
  },
};

const STATUS_LABEL = {
  NOT_CONNECTED: { label: "Sin conectar", tone: "neutral" },
  ACTIVE: { label: "Conectada", tone: "success" },
  EXPIRED: { label: "Vencida", tone: "warning" },
  REVOKED: { label: "Revocada", tone: "warning" },
  DISCONNECTED: { label: "Desconectada", tone: "neutral" },
} as const;

export default async function MercadoPagoPage({
  searchParams,
}: PageProps<"/dashboard/mercadopago">) {
  const user = await requirePageUser("/dashboard/mercadopago");
  const { status: result } = await searchParams;
  const connection = await getConnectionStatus(getPrisma(), user.id);
  const message = typeof result === "string" ? RESULT_MESSAGES[result] : undefined;
  const statusInfo = STATUS_LABEL[connection.status];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-3xl font-bold sm:text-4xl">
          <Wallet className="size-8" aria-hidden="true" />
          Mercado Pago
        </h1>
        <p className="text-muted-foreground">
          Conectá tu cuenta para recibir aportes. El dinero se acredita directo en tu cuenta de
          Mercado Pago: QuieroEso nunca lo retiene.
        </p>
      </div>

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">Estado de la conexión</h2>
          <Badge tone={statusInfo.tone} data-testid="mp-status">
            {connection.status === "ACTIVE" ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : null}
            {statusInfo.label}
          </Badge>
          {connection.status === "ACTIVE" && !connection.liveMode ? (
            <Badge tone="warning">Modo prueba</Badge>
          ) : null}
        </div>
        {connection.connectedAt && connection.status !== "NOT_CONNECTED" ? (
          <p className="text-sm text-muted-foreground">
            Cuenta de Mercado Pago N.º {connection.mercadoPagoUserId} · conectada el{" "}
            {formatDate(connection.connectedAt)}
          </p>
        ) : null}
        {connection.status === "EXPIRED" || connection.status === "REVOKED" ? (
          <Alert tone="error">
            Mercado Pago dejó de autorizarnos. Reconectá tu cuenta para seguir recibiendo aportes.
          </Alert>
        ) : null}
        <MercadoPagoActions connected={connection.status === "ACTIVE"} />
      </Card>

      <Card className="flex flex-col gap-2 p-5 text-sm">
        <p className="flex items-center gap-2 font-bold">
          <ShieldCheck className="size-5 text-success" aria-hidden="true" />
          Cómo cuidamos tu cuenta
        </p>
        <ul className="ml-5 flex list-disc flex-col gap-1 text-muted-foreground">
          <li>
            Usamos la autorización oficial de Mercado Pago (OAuth); nunca vemos tu contraseña.
          </li>
          <li>Los permisos se guardan cifrados y podés desconectarte en cualquier momento.</li>
          <li>Los reembolsos se hacen desde tu cuenta de Mercado Pago.</li>
        </ul>
      </Card>
    </div>
  );
}
