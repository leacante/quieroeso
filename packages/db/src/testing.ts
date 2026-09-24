import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "./generated/prisma/client";

const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");

/** Applies all migrations to the given database (used by test global setup). */
export function migrateTestDatabase(databaseUrl: string): void {
  if (!/_test\b|test/.test(new URL(databaseUrl).pathname)) {
    throw new Error("Refusing to migrate a database whose name does not contain 'test'.");
  }
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}

/** Empties every application table. Only for test databases. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function createTestUser(
  prisma: PrismaClient,
  overrides: Partial<{ id: string; name: string; email: string }> = {},
) {
  const id = overrides.id ?? `user_${randomUUID()}`;
  return prisma.user.create({
    data: {
      id,
      name: overrides.name ?? "Usuario de prueba",
      email: overrides.email ?? `${id}@example.com`,
      emailVerified: true,
    },
  });
}
