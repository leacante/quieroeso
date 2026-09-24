import type { Prisma, TransactionClient } from "@quieroeso/db";

export type AuditAction =
  | "list.published"
  | "list.made_private"
  | "list.archived"
  | "list.share_token_rotated"
  | "list.funding_mode_changed"
  | "mercadopago.connected"
  | "mercadopago.disconnected"
  | "mercadopago.token_refreshed"
  | "free_tier.assigned";

export type AuditEventInput = {
  actorUserId: string | null;
  action: AuditAction;
  targetType: "list" | "list_item" | "mercadopago_connection" | "user";
  targetId: string;
  /** Non-sensitive context only: never tokens, share links or contributor messages. */
  metadata?: Record<string, string | number | boolean | null>;
};

const FORBIDDEN_METADATA_KEY = /token|secret|password|message|cookie|authorization/i;

export async function writeAuditEvent(
  tx: TransactionClient,
  event: AuditEventInput,
): Promise<void> {
  const metadata = event.metadata ?? {};
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error(`audit metadata key "${key}" is not allowed`);
    }
  }
  await tx.auditEvent.create({
    data: {
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: metadata as Prisma.InputJsonObject,
    },
  });
}
