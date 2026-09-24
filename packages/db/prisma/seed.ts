/**
 * Base seed: identity data only (a demo user linked to a fixed Google `sub`).
 * Lists, publication and free slots are seeded by `packages/domain/src/seed.ts`
 * through the domain services, so they follow the same rules as the app.
 * Safe to run repeatedly.
 */
import { realpathSync } from "node:fs";
import path from "node:path";
import { loadRootDotenv } from "@quieroeso/config/load-dotenv";
import { createPrismaClient } from "../src/client";
import type { PrismaClient } from "../src/generated/prisma/client";

export const DEMO_USER = {
  id: "seed_user_demo",
  name: "Demo QuieroEso",
  email: "demo@quieroeso.test",
  googleSub: "100000000000000000999",
} as const;

export async function seedBaseData(prisma: PrismaClient): Promise<void> {
  await prisma.user.upsert({
    where: { id: DEMO_USER.id },
    update: {},
    create: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email, emailVerified: true },
  });
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: "google", accountId: DEMO_USER.googleSub } },
    update: {},
    create: {
      id: "seed_account_demo",
      providerId: "google",
      accountId: DEMO_USER.googleSub,
      userId: DEMO_USER.id,
    },
  });
}

// realpath: package managers expose workspaces through symlinks.
const isEntryPoint =
  process.argv[1] !== undefined &&
  realpathSync(path.resolve(process.argv[1])) === realpathSync(import.meta.filename);

if (isEntryPoint) {
  loadRootDotenv(import.meta.dirname);
  const prisma = createPrismaClient();
  seedBaseData(prisma)
    .then(() => console.log("Base seed completed."))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
