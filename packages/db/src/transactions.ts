import { Prisma, type PrismaClient } from "./generated/prisma/client";

export type TransactionClient = Prisma.TransactionClient;

const SERIALIZATION_CODES = new Set(["40001", "40P01"]);

/** True for Postgres serialization failures and deadlocks, which are safe to retry. */
export function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    const meta = error.meta as
      { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined;
    const code = meta?.code ?? meta?.driverAdapterError?.cause?.originalCode;
    return typeof code === "string" && SERIALIZATION_CODES.has(code);
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" && SERIALIZATION_CODES.has(code);
  }
  return false;
}

export type SerializableRetryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
};

/**
 * Runs `fn` in a SERIALIZABLE transaction, retrying a bounded number of times
 * when Postgres aborts it because of a concurrent conflicting transaction.
 */
export async function withSerializableRetry<T>(
  prisma: PrismaClient,
  fn: (tx: TransactionClient) => Promise<T>,
  { maxAttempts = 5, timeoutMs = 10_000 }: SerializableRetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: timeoutMs,
      });
    } catch (error) {
      if (attempt >= maxAttempts || !isSerializationFailure(error)) throw error;
      const backoff = 20 * 2 ** attempt + Math.random() * 25;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
