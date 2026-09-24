import type { PrismaClient } from "@quieroeso/db";
import type { TokenVault } from "@quieroeso/integrations/crypto";
import { z } from "zod";

export type ListDeps = {
  db: PrismaClient;
  vault: TokenVault;
};

export type PublishListInput = {
  listId: string;
  ownerId: string;
  visibility: "PUBLIC" | "UNLISTED";
};

const title = z
  .string()
  .trim()
  .min(1, "Poné un nombre para la lista.")
  .max(120, "Usá como máximo 120 caracteres.");
const description = z.string().trim().max(1000, "Usá como máximo 1000 caracteres.");

export const createListSchema = z.object({
  title,
  description: description.optional(),
});
export type CreateListInput = z.infer<typeof createListSchema>;

export const updateListSchema = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    fundingMode: z.enum(["WISHLIST", "PER_ITEM"]).optional(),
    visibility: z.literal("PRIVATE").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");
export type UpdateListPatch = z.infer<typeof updateListSchema>;

export const publishListSchema = z.object({
  visibility: z.enum(["PUBLIC", "UNLISTED"]),
});

/** Share token context for the token vault (binds the ciphertext to the list). */
export function shareTokenContext(listId: string): string {
  return `list:share-token:${listId}`;
}
