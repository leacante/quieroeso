import { processPaymentEvent, recordWebhookEvent } from "@quieroeso/domain";
import { getPrisma } from "@quieroeso/db";
import { verifyWebhookSignature } from "@quieroeso/integrations/mercadopago";
import { after } from "next/server";
import { logger } from "@/lib/server/logger";
import { readTextBody, RequestBodyError } from "@/lib/server/problem";
import { getMercadoPagoConfig, getPaymentEventDeps } from "@/lib/server/services";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

type NotificationBody = {
  id?: string | number;
  type?: string;
  action?: string;
  user_id?: string | number;
  data?: { id?: string | number };
};

function parseBody(text: string): NotificationBody {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as NotificationBody) : {};
  } catch {
    return {};
  }
}

/**
 * Mercado Pago notifications. The signature is verified before anything is read
 * or stored; the event is persisted, acknowledged quickly, and then processed by
 * re-reading the payment from Mercado Pago. Logs never include the body.
 */
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let text: string;
  try {
    text = await readTextBody(request, MAX_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return new Response(null, { status });
  }
  const body = parseBody(text);
  const dataId =
    url.searchParams.get("data.id") ?? (body.data?.id !== undefined ? String(body.data.id) : null);
  const topic = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body.type ?? null;
  const requestId = request.headers.get("x-request-id");

  const valid = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId,
    dataId,
    secret: getMercadoPagoConfig().webhookSecret,
  });
  if (!valid) {
    logger.warn(
      { topic, hasRequestId: Boolean(requestId) },
      "rejected webhook with invalid signature",
    );
    return new Response(null, { status: 401 });
  }

  const recorded = await recordWebhookEvent(getPrisma(), {
    providerEventId: body.id !== undefined ? String(body.id) : `${topic}:${dataId}:${requestId}`,
    topic,
    resourceId: dataId,
    collectorId: body.user_id !== undefined ? String(body.user_id) : null,
    rawBody: text,
  });

  if (recorded.status !== "DUPLICATE") {
    after(async () => {
      try {
        await processPaymentEvent(getPaymentEventDeps(), {
          eventId: recorded.id,
          topic,
          paymentId: dataId,
          collectorId: body.user_id !== undefined ? String(body.user_id) : null,
        });
      } catch (error) {
        // Left unprocessed; the jobs process retries it (processPendingWebhookEvents).
        logger.error({ err: error, webhookEventId: recorded.id }, "webhook processing failed");
      }
    });
  }
  return Response.json({ received: true, duplicate: recorded.status === "DUPLICATE" });
}
