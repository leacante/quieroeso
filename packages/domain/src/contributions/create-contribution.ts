import type { PrismaClient } from "@quieroeso/db";
import { sha256Hex } from "@quieroeso/integrations/crypto";
import {
  MercadoPagoApiError,
  type CreatedPreference,
  type PreferenceInput,
} from "@quieroeso/integrations/mercadopago";
import { getLogger } from "@quieroeso/observability";
import { z } from "zod";
import { DomainError } from "../errors";
import { minorAmountSchema } from "../lists/item-service";
import { calculateFeeMinor, formatMinor, minorToDecimalNumber } from "../money/money";

/** Unpaid checkouts reserve part of the remaining target for this long. */
export const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

const RESERVING_STATUSES = ["CREATED", "CHECKOUT_CREATED", "PENDING"] as const;

export const createContributionSchema = z.object({
  listItemId: z.string().min(1).max(64),
  amountMinor: minorAmountSchema,
  contributorName: z.string().trim().max(80, "Usá como máximo 80 caracteres.").optional(),
  contributorMessage: z.string().trim().max(280, "Usá como máximo 280 caracteres.").optional(),
  /** How the visitor reached the list: public slug or secret share token. */
  access: z.discriminatedUnion("type", [
    z.object({ type: z.literal("public"), slug: z.string().min(1).max(200) }),
    z.object({ type: z.literal("shared"), token: z.string().min(20).max(100) }),
  ]),
  acceptTerms: z.literal(true, { error: "Tenés que aceptar los términos para continuar." }),
});

export type CreateContributionInput = z.infer<typeof createContributionSchema>;

export type ContributionDeps = {
  db: PrismaClient;
  /** Access token of the list owner's Mercado Pago account (refreshed if needed). */
  getOwnerAccessToken(ownerId: string): Promise<{ accessToken: string; mercadoPagoUserId: string }>;
  createPreference(accessToken: string, input: PreferenceInput, idempotencyKey: string): Promise<CreatedPreference>;
  config: {
    minContributionMinor: bigint;
    appUrl: string;
    notificationUrl: string;
    /** Hosts a checkout URL may point to (https only, except explicitly listed local mock hosts). */
    checkoutHosts: string[];
  };
  now?: () => Date;
};

export type CreatedContribution = { contributionId: string; checkoutUrl: string };

const NOT_AVAILABLE = "Este producto no está recibiendo aportes.";

function resultUrl(appUrl: string, contributionId: string, outcome: string): string {
  const url = new URL("/aportes/resultado", appUrl);
  url.searchParams.set("contribution", contributionId);
  url.searchParams.set("outcome", outcome);
  return url.toString();
}

function assertCheckoutUrl(url: string, hosts: string[]): string {
  const parsed = new URL(url);
  const local = parsed.protocol === "http:" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(parsed.host);
  if (!hosts.includes(parsed.host.toLowerCase()) || !(parsed.protocol === "https:" || local)) {
    throw new DomainError("UPSTREAM_UNAVAILABLE", "No pudimos iniciar el pago. Probá de nuevo.");
  }
  return parsed.toString();
}

/**
 * Creates a contribution for one product and its Checkout Pro preference.
 * The Contribution row is written first, and its id is both the preference's
 * external_reference and the X-Idempotency-Key, so retries never create a second
 * charge. Repeating a request with the same client Idempotency-Key returns the
 * same contribution.
 */
export async function createContribution(
  deps: ContributionDeps,
  input: CreateContributionInput,
  idempotencyKey: string,
): Promise<CreatedContribution> {
  const now = deps.now?.() ?? new Date();

  const existing = await deps.db.contribution.findUnique({ where: { idempotencyKey } });
  if (existing && (existing.listItemId !== input.listItemId || existing.amountMinor !== input.amountMinor)) {
    throw new DomainError("CONFLICT", "Esta solicitud ya se usó para otro aporte. Recargá la página.");
  }

  const item = await deps.db.listItem.findUnique({
    where: { id: input.listItemId },
    include: { list: true },
  });
  const list = item?.list;
  const accessOk =
    !!list &&
    !list.archivedAt &&
    (input.access.type === "public"
      ? list.visibility === "PUBLIC" && list.slug === input.access.slug
      : list.visibility !== "PRIVATE" && list.shareTokenHash === sha256Hex(input.access.token));
  if (!item || !list || !accessOk) throw new DomainError("NOT_FOUND", "No encontramos ese producto.");
  if (list.fundingMode !== "PER_ITEM" || item.archivedAt || !item.targetAmountMinor) {
    throw new DomainError("INVALID_STATE", NOT_AVAILABLE);
  }

  // Throws MERCADOPAGO_NOT_CONNECTED when the owner has no active connection.
  const owner = await deps.getOwnerAccessToken(list.ownerId);

  const contribution =
    existing ??
    (await deps.db.$transaction(async (tx) => {
      // Serializes amount checks for the same product.
      await tx.$queryRaw`SELECT "id" FROM "ListItem" WHERE "id" = ${item.id} FOR UPDATE`;
      const [approved, reserved] = await Promise.all([
        tx.contribution.aggregate({
          where: { listItemId: item.id, status: "APPROVED" },
          _sum: { amountMinor: true },
        }),
        tx.contribution.aggregate({
          where: {
            listItemId: item.id,
            status: { in: [...RESERVING_STATUSES] },
            createdAt: { gt: new Date(now.getTime() - RESERVATION_WINDOW_MS) },
          },
          _sum: { amountMinor: true },
        }),
      ]);
      const target = item.targetAmountMinor!;
      const remaining = target - (approved._sum.amountMinor ?? 0n) - (reserved._sum.amountMinor ?? 0n);
      if (remaining <= 0n) {
        throw new DomainError("INVALID_STATE", "Este producto ya tiene aportes por el total. ¡Gracias!");
      }
      const minimum = deps.config.minContributionMinor < remaining ? deps.config.minContributionMinor : remaining;
      if (input.amountMinor < minimum || input.amountMinor > remaining) {
        const range = (value: bigint) => formatMinor(value).replace(/\s/g, " ");
        const detail = `Podés aportar entre ${range(minimum)} y ${range(remaining)}.`;
        throw new DomainError("VALIDATION_FAILED", detail, {
          fields: { amountMinor: "El monto está fuera del rango permitido." },
        });
      }
      const rateBps = item.feeRateBps;
      return tx.contribution.create({
        data: {
          listItemId: item.id,
          amountMinor: input.amountMinor,
          contributorName: input.contributorName || null,
          contributorMessage: input.contributorMessage || null,
          platformFeeRateBps: rateBps,
          platformFeeAmountMinor: calculateFeeMinor(input.amountMinor, BigInt(rateBps)),
          collectorId: owner.mercadoPagoUserId,
          idempotencyKey,
        },
      });
    }));

  let preference: CreatedPreference;
  try {
    preference = await deps.createPreference(
      owner.accessToken,
      {
        item: {
          id: item.id,
          title: `Aporte para: ${item.title}`,
          unitPrice: minorToDecimalNumber(contribution.amountMinor),
          ...(item.imageUrl?.startsWith("https://") ? { pictureUrl: item.imageUrl } : {}),
        },
        externalReference: contribution.id,
        notificationUrl: deps.config.notificationUrl,
        backUrls: {
          success: resultUrl(deps.config.appUrl, contribution.id, "success"),
          pending: resultUrl(deps.config.appUrl, contribution.id, "pending"),
          failure: resultUrl(deps.config.appUrl, contribution.id, "failure"),
        },
        // 0% items send no marketplace_fee at all.
        ...(contribution.platformFeeAmountMinor > 0n
          ? { marketplaceFee: minorToDecimalNumber(contribution.platformFeeAmountMinor) }
          : {}),
        statementDescriptor: "QUIEROESO",
      },
      contribution.id,
    );
  } catch (error) {
    getLogger().warn({ err: error, contributionId: contribution.id }, "checkout preference failed");
    if (error instanceof MercadoPagoApiError && error.kind === "BAD_REQUEST") {
      await deps.db.contribution.update({ where: { id: contribution.id }, data: { status: "CANCELLED" } });
    }
    throw new DomainError("UPSTREAM_UNAVAILABLE", "Mercado Pago no responde. Probá de nuevo en unos minutos.", {
      retryAfterSeconds: 10,
    });
  }

  const checkoutUrl = assertCheckoutUrl(preference.initPoint, deps.config.checkoutHosts);
  if (contribution.status === "CREATED" || contribution.mpPreferenceId !== preference.id) {
    await deps.db.contribution.updateMany({
      where: { id: contribution.id, status: { in: ["CREATED", "CHECKOUT_CREATED"] } },
      data: { mpPreferenceId: preference.id, status: "CHECKOUT_CREATED" },
    });
  }
  return { contributionId: contribution.id, checkoutUrl };
}
