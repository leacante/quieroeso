/**
 * Local demo data: a public list owned by the seed user, created through the
 * domain services so publication and free slots follow the real rules.
 * Idempotent (skips when the demo user already has lists). Never run in production.
 */
import { realpathSync } from "node:fs";
import path from "node:path";
import { getEnv } from "@quieroeso/config";
import { loadRootDotenv } from "@quieroeso/config/load-dotenv";
import { createPrismaClient, type PrismaClient } from "@quieroeso/db";
import { DEMO_USER, seedBaseData } from "@quieroeso/db/seed";
import { createTokenVault } from "@quieroeso/integrations/crypto";
import { insertItem } from "./lists/item-service";
import { createList, publishList } from "./lists/list-service";

const DEMO_PRODUCTS = [
  { id: "MLA1000000001", title: "Cafetera Express Oster 15 Bares Acero", priceMinor: 18_999_999n },
  {
    id: "MLA1000000002",
    title: "Auriculares Inalámbricos Sony WH-CH520 Azul",
    priceMinor: 7_499_900n,
  },
  { id: "MLA1000000006", title: "Kindle Paperwhite 16 GB Negro", priceMinor: 28_999_900n },
  { id: "MLA1000000010", title: "Parlante Bluetooth JBL Flip 6 Rojo", priceMinor: 16_999_900n },
] as const;

export async function seedDemoLists(db: PrismaClient): Promise<string | null> {
  const env = getEnv();
  if (env.APP_ENV === "production" || env.APP_ENV === "staging") {
    throw new Error("Refusing to seed demo data outside local/test environments.");
  }
  if ((await db.wishList.count({ where: { ownerId: DEMO_USER.id } })) > 0) return null;

  const vault = createTokenVault(env.tokenEncryptionKeys, env.ACTIVE_TOKEN_KEY_VERSION);
  const list = await createList(db, DEMO_USER.id, {
    title: "Lista de ejemplo",
    description: "Una lista pública de demostración para probar QuieroEso en local.",
  });
  const ref = { listId: list.id, ownerId: DEMO_USER.id };
  const now = new Date();
  for (const product of DEMO_PRODUCTS) {
    const canonicalUrl = `https://articulo.mercadolibre.com.ar/MLA-${product.id.slice(3)}`;
    const imageUrl = env.MOCK_PROVIDERS_PUBLIC_URL
      ? `${env.MOCK_PROVIDERS_PUBLIC_URL}/meli/img/${product.id}.svg`
      : null;
    await insertItem(db, ref, {
      sourceType: "MERCADOLIBRE",
      sourceUrl: canonicalUrl,
      externalId: product.id,
      externalKind: "ITEM",
      title: product.title,
      notes: null,
      imageUrl,
      sourceSnapshot: {
        externalId: product.id,
        kind: "ITEM",
        canonicalUrl,
        title: product.title,
        imageUrl,
        priceMinor: product.priceMinor.toString(),
        currency: "ARS",
        availability: "AVAILABLE",
        fetchedAt: now.toISOString(),
      },
      priceMinor: product.priceMinor,
      targetAmountMinor: null,
      availability: "AVAILABLE",
      lastSyncedAt: now,
    });
  }
  await publishList({ db, vault }, { ...ref, visibility: "PUBLIC" });
  return list.slug;
}

// realpath: package managers expose workspaces through symlinks.
const isEntryPoint =
  process.argv[1] !== undefined &&
  realpathSync(path.resolve(process.argv[1])) === realpathSync(import.meta.filename);

if (isEntryPoint) {
  loadRootDotenv(import.meta.dirname);
  const db = createPrismaClient();
  try {
    await seedBaseData(db);
    const slug = await seedDemoLists(db);
    console.log(slug ? `Demo list published at /l/${slug}` : "Demo data already present.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
