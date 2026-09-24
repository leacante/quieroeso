import { z } from "zod";
import { MercadoPagoApiError, mercadoPagoRequest, type MercadoPagoHttpOptions } from "./http";

/** Checkout Pro preference for exactly one product and one contribution. */
export type PreferenceInput = {
  item: { id: string; title: string; unitPrice: number; pictureUrl?: string };
  externalReference: string;
  notificationUrl: string;
  backUrls: { success: string; pending: string; failure: string };
  /** Platform fee in ARS; omitted entirely for 0%. */
  marketplaceFee?: number;
  statementDescriptor?: string;
};

const preferenceResponseSchema = z.object({
  id: z.string().min(1),
  init_point: z.url(),
  sandbox_init_point: z.url().optional(),
});

export type CreatedPreference = { id: string; initPoint: string };

export async function createPreference(
  options: MercadoPagoHttpOptions,
  accessToken: string,
  input: PreferenceInput,
  idempotencyKey: string,
): Promise<CreatedPreference> {
  const body = {
    items: [
      {
        id: input.item.id,
        title: input.item.title.slice(0, 256),
        quantity: 1,
        currency_id: "ARS",
        unit_price: input.item.unitPrice,
        ...(input.item.pictureUrl ? { picture_url: input.item.pictureUrl } : {}),
      },
    ],
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    back_urls: input.backUrls,
    auto_return: "approved",
    binary_mode: false,
    ...(input.statementDescriptor ? { statement_descriptor: input.statementDescriptor } : {}),
    ...(input.marketplaceFee !== undefined ? { marketplace_fee: input.marketplaceFee } : {}),
  };
  const raw = await mercadoPagoRequest(options, "POST", "/checkout/preferences", {
    body,
    accessToken,
    idempotencyKey,
  });
  const parsed = preferenceResponseSchema.safeParse(raw);
  if (!parsed.success) throw new MercadoPagoApiError("UPSTREAM", 200);
  return { id: parsed.data.id, initPoint: parsed.data.init_point };
}

export const paymentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  status: z.string(),
  status_detail: z.string().nullable().optional(),
  transaction_amount: z.number(),
  currency_id: z.string(),
  external_reference: z.string().nullable().optional(),
  collector_id: z.union([z.number(), z.string()]).transform(String).nullable().optional(),
  date_approved: z.string().nullable().optional(),
});

export type MercadoPagoPayment = z.infer<typeof paymentSchema>;

export async function getPayment(
  options: MercadoPagoHttpOptions,
  accessToken: string,
  paymentId: string,
): Promise<MercadoPagoPayment> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new MercadoPagoApiError("BAD_REQUEST", null);
  const raw = await mercadoPagoRequest(options, "GET", `/v1/payments/${paymentId}`, {
    accessToken,
  });
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) throw new MercadoPagoApiError("UPSTREAM", 200);
  return parsed.data;
}
