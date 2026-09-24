import { createHmac } from "node:crypto";
import { safeEqual } from "../crypto/token-vault";

export type ParsedSignature = { ts: string; v1: string };

/** Parses `ts=1742505638683,v1=<hex>` (order-independent, whitespace tolerant). */
export function parseSignatureHeader(header: string | null): ParsedSignature | null {
  if (!header) return null;
  const parts = new Map<string, string>();
  for (const segment of header.split(",")) {
    const [key, ...rest] = segment.split("=");
    if (key && rest.length > 0) parts.set(key.trim(), rest.join("=").trim());
  }
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { ts, v1: v1.toLowerCase() };
}

/**
 * Manifest defined by Mercado Pago: `id:{data.id};request-id:{x-request-id};ts:{ts};`.
 * Alphanumeric ids are lowercased; absent parts are omitted.
 */
export function buildSignatureManifest(params: { dataId: string | null; requestId: string | null; ts: string }): string {
  let manifest = "";
  if (params.dataId) manifest += `id:${params.dataId.toLowerCase()};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${params.ts};`;
  return manifest;
}

/**
 * Verifies the HMAC-SHA256 `x-signature` of a notification. Replays of a valid
 * signature are harmless: processing is idempotent and payment state is always
 * re-read from Mercado Pago.
 */
export function verifyWebhookSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const signature = parseSignatureHeader(params.signatureHeader);
  if (!signature || !params.requestId || !params.dataId) return false;
  const expected = createHmac("sha256", params.secret)
    .update(buildSignatureManifest({ dataId: params.dataId, requestId: params.requestId, ts: signature.ts }))
    .digest("hex");
  return safeEqual(expected, signature.v1);
}
