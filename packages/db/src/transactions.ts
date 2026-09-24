import { Prisma, type PrismaClient } from "./generated/prisma/client";

export type TransactionClient = Prisma.TransactionClient;

const SERIALIZATION_CODES = new Set(["40001", "40P01"]);

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const meta = (error as { meta?: unknown }).meta as
    { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined;
  const code =
    meta?.code ??
    meta?.driverAdapterError?.cause?.originalCode ??
    (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** True for Postgres serialization failures and deadlocks, which are safe to retry. */
export function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const code = postgresCode(error);
  return code !== undefined && SERIALIZATION_CODES.has(code);
}

/** True for unique constraint violations (Prisma P2002 / Postgres 23505). */
export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return true;
  return postgresCode(error) === "23505";
}

export type SerializableRetryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
  /**
   * Also retry on unique violations. Use when a uniqueness constraint is the final
   * arbiter of a race (the retry then observes the winner's committed row).
   */
  retryOnUniqueViolation?: boolean;
};

/**
 * Runs `fn` in a SERIALIZABLE transaction, retrying a bounded number of times
 * when Postgres aborts it because of a concurrent conflicting transaction.
 */
export async function withSerializableRetry<T>(
  prisma: PrismaClient,
  fn: (tx: TransactionClient) => Promise<T>,
  {
    maxAttempts = 5,
    timeoutMs = 10_000,
    retryOnUniqueViolation = false,
  }: SerializableRetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: timeoutMs,
      });
    } catch (error) {
      const retryable =
        isSerializationFailure(error) || (retryOnUniqueViolation && isUniqueViolation(error));
      if (attempt >= maxAttempts || !retryable) throw error;
      const backoff = 20 * 2 ** attempt + Math.random() * 25;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
