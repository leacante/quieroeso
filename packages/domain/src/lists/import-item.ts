import type { PrismaClient } from "@quieroeso/db";
import {
  MercadoLibreApiError,
  parseMercadoLibreUrl,
  resolveShortLink,
  ShortLinkError,
  UnsupportedUrlError,
  type HopFetcher,
  type MercadoLibreGateway,
  type MercadoLibreReference,
  type ProductSnapshotInput,
} from "@quieroeso/integrations/mercadolibre";
import { z } from "zod";
import { DomainError } from "../errors";
import { insertItem } from "./item-service";

export type ImportDeps = {
  db: PrismaClient;
  meli: MercadoLibreGateway;
  fetchHop: HopFetcher;
};

export const importItemSchema = z.object({
  url: z.string().trim().min(1, "Pegá un enlace de Mercado Libre.").max(2048),
  notes: z.string().trim().max(500).optional(),
});
export type ImportItemInput = z.infer<typeof importItemSchema>;

const UNSUPPORTED_DETAIL =
  "Pegá un enlace de un producto de mercadolibre.com.ar o un enlace corto meli.la.";

/** Serializable form of a snapshot, stored in `ListItem.sourceSnapshot`. */
export function snapshotToJson(snapshot: ProductSnapshotInput, fetchedAt: Date) {
  return {
    ...snapshot,
    priceMinor: snapshot.priceMinor === null ? null : snapshot.priceMinor.toString(),
    fetchedAt: fetchedAt.toISOString(),
  };
}

async function resolveReference(deps: ImportDeps, url: string): Promise<MercadoLibreReference> {
  try {
    const parsed = parseMercadoLibreUrl(url);
    if (parsed.type === "SHORT_LINK") {
      return await resolveShortLink(parsed.url, deps.fetchHop);
    }
    const { type: _type, ...reference } = parsed;
    return reference;
  } catch (error) {
    if (error instanceof UnsupportedUrlError || error instanceof ShortLinkError) {
      throw new DomainError("UNSUPPORTED_URL", UNSUPPORTED_DETAIL, {
        fields: { url: UNSUPPORTED_DETAIL },
      });
    }
    throw error;
  }
}

async function fetchSnapshot(deps: ImportDeps, reference: MercadoLibreReference) {
  try {
    return await deps.meli.fetchSnapshot(reference);
  } catch (error) {
    if (error instanceof MercadoLibreApiError) {
      if (error.kind === "NOT_FOUND") {
        throw new DomainError("NOT_FOUND", "No encontramos esa publicación en Mercado Libre.");
      }
      throw new DomainError(
        "UPSTREAM_UNAVAILABLE",
        "Mercado Libre no responde en este momento. Probá de nuevo en unos minutos.",
        { retryAfterSeconds: error.retryAfterSeconds ?? 30 },
      );
    }
    throw error;
  }
}

/**
 * Imports a Mercado Libre product into a list: validates the link (no network
 * access except meli.la short-link resolution), fetches the official API and stores
 * the snapshot alongside editable presentation fields.
 */
export async function importListItem(
  deps: ImportDeps,
  ref: { listId: string; ownerId: string },
  input: ImportItemInput,
) {
  const list = await deps.db.wishList.findFirst({
    where: { id: ref.listId, ownerId: ref.ownerId, archivedAt: null },
    select: { id: true },
  });
  if (!list) throw new DomainError("NOT_FOUND", "No encontramos esa lista.");

  const reference = await resolveReference(deps, input.url);
  const duplicate = await deps.db.listItem.findFirst({
    where: { listId: ref.listId, externalId: reference.externalId, archivedAt: null },
    select: { id: true },
  });
  if (duplicate) {
    throw new DomainError("CONFLICT", "Ese producto ya está en tu lista.");
  }

  const snapshot = await fetchSnapshot(deps, reference);
  const fetchedAt = new Date();
  return insertItem(deps.db, ref, {
    sourceType: "MERCADOLIBRE",
    sourceUrl: snapshot.canonicalUrl,
    externalId: snapshot.externalId,
    externalKind: snapshot.kind,
    title: snapshot.title,
    notes: input.notes || null,
    imageUrl: snapshot.imageUrl,
    sourceSnapshot: snapshotToJson(snapshot, fetchedAt),
    priceMinor: snapshot.priceMinor,
    targetAmountMinor: null,
    availability: snapshot.availability,
    lastSyncedAt: fetchedAt,
  });
}
