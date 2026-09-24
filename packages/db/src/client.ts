import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as typeof globalThis & { __quieroesoPrisma?: PrismaClient };

/**
 * Process-wide Prisma client. Created on first use so importing this module never
 * requires DATABASE_URL; reused across Next.js hot reloads in development.
 */
export function getPrisma(): PrismaClient {
  globalForPrisma.__quieroesoPrisma ??= createPrismaClient();
  return globalForPrisma.__quieroesoPrisma;
}
