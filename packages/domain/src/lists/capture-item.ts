import type { PrismaClient } from "@quieroeso/db";
import {
  isMercadoLibreHost,
  parseMercadoLibreUrl,
  UnsupportedUrlError,
} from "@quieroeso/integrations/mercadolibre";
import { z } from "zod";
import { DomainError } from "../errors";
import { insertItem, minorAmountSchema } from "./item-service";

/**
 * Product data read by the "Guardar en QuieroEso" bookmarklet from a Mercado Libre page
 * the owner has open. Used for listings the API refuses to share with the application.
 */
export const capturedItemSchema = z.object({
  url: z.string().trim().min(1, "Falta el enlace del producto.").max(2048),
  title: z.string().trim().min(1, "Poné un nombre.").max(200, "Usá como máximo 200 caracteres."),
  imageUrl: z.string().trim().max(2048).optional(),
  priceMinor: minorAmountSchema.optional(),
  notes: z.string().trim().max(500, "Usá como máximo 500 caracteres.").optional(),
});
export type CapturedItemInput = z.infer<typeof capturedItemSchema>;

const NOT_MERCADOLIBRE = "Solo se pueden guardar productos de mercadolibre.com.ar.";

/** Tracking-free link to the product page; rejects anything outside Mercado Libre. */
export function canonicalCapturedUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DomainError("UNSUPPORTED_URL", NOT_MERCADOLIBRE, {
      fields: { url: NOT_MERCADOLIBRE },
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !isMercadoLibreHost(url.hostname)
  ) {
    throw new DomainError("UNSUPPORTED_URL", NOT_MERCADOLIBRE, {
      fields: { url: NOT_MERCADOLIBRE },
    });
  }
  try {
    const parsed = parseMercadoLibreUrl(url.toString());
    if (parsed.type === "REFERENCE") return parsed.canonicalUrl;
  } catch (error) {
    if (!(error instanceof UnsupportedUrlError)) throw error;
  }
  return `https://${url.hostname.toLowerCase().replace(/\.$/, "")}${url.pathname}`;
}

/** Only Mercado Libre's image CDN is allowed (next/image serves nothing else). */
function capturedImage(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === "https:" && url.hostname.endsWith(".mlstatic.com")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Stores a captured product. It has no `externalId`, so the snapshot refresh leaves it
 * alone: the API would answer 403 for it on every run.
 */
export async function addCapturedItem(
  db: PrismaClient,
  ref: { listId: string; ownerId: string },
  input: CapturedItemInput,
) {
  const sourceUrl = canonicalCapturedUrl(input.url);
  const duplicate = await db.listItem.findFirst({
    where: { listId: ref.listId, sourceUrl, archivedAt: null, list: { ownerId: ref.ownerId } },
    select: { id: true },
  });
  if (duplicate) throw new DomainError("CONFLICT", "Ese producto ya está en tu lista.");

  const imageUrl = capturedImage(input.imageUrl);
  const priceMinor = input.priceMinor ?? null;
  const capturedAt = new Date();
  return insertItem(db, ref, {
    sourceType: "MERCADOLIBRE",
    sourceUrl,
    externalId: null,
    externalKind: null,
    title: input.title,
    notes: input.notes || null,
    imageUrl,
    sourceSnapshot: {
      origin: "BROWSER_CAPTURE",
      canonicalUrl: sourceUrl,
      title: input.title,
      imageUrl,
      priceMinor: priceMinor === null ? null : priceMinor.toString(),
      currency: "ARS",
      fetchedAt: capturedAt.toISOString(),
    },
    priceMinor,
    targetAmountMinor: null,
    availability: "UNKNOWN",
    lastSyncedAt: capturedAt,
  });
}
