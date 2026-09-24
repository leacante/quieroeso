import { getPrisma } from "@quieroeso/db";
import { getLogger } from "@quieroeso/observability";

export type HealthResult = {
  status: 200 | 503;
  body: { status: "ok" | "degraded"; database: "ok" | "unreachable"; uptimeSeconds: number };
};

type Database = { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> };

const DB_TIMEOUT_MS = 2_000;

/** Checks process and database health. The database is reached with `SELECT 1`. */
export async function checkHealth(db: Database = getPrisma()): Promise<HealthResult> {
  const uptimeSeconds = Math.round(process.uptime());
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("database health check timed out")), DB_TIMEOUT_MS),
      ),
    ]);
    return { status: 200, body: { status: "ok", database: "ok", uptimeSeconds } };
  } catch (error) {
    getLogger().warn({ err: error }, "health check: database unreachable");
    return { status: 503, body: { status: "degraded", database: "unreachable", uptimeSeconds } };
  }
}
