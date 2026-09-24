import { getEnv, mercadoLibreSettings, mercadoPagoSettings } from "@quieroeso/config";
import { loadRootDotenv } from "@quieroeso/config/load-dotenv";
import { createPrismaClient } from "@quieroeso/db";
import { getActiveAccessToken, type ConnectionDeps, type PaymentEventDeps } from "@quieroeso/domain";
import { createTokenVault } from "@quieroeso/integrations/crypto";
import { createMercadoLibreClient } from "@quieroeso/integrations/mercadolibre";
import { getPayment, refreshAccessToken } from "@quieroeso/integrations/mercadopago";
import { getLogger, type Logger } from "@quieroeso/observability";

/** Shared bootstrap for job commands: env, database and provider clients. */
export function createJobRuntime(name: string) {
  loadRootDotenv(import.meta.dirname);
  process.env.SERVICE_NAME ??= `jobs-${name}`;
  const env = getEnv();
  const db = createPrismaClient(env.DATABASE_URL);
  const logger = getLogger().child({ job: name });
  const meliSettings = mercadoLibreSettings(env);
  const mp = mercadoPagoSettings(env);
  const vault = createTokenVault(env.tokenEncryptionKeys, env.ACTIVE_TOKEN_KEY_VERSION);

  const connection: ConnectionDeps = {
    db,
    vault,
    oauth: {
      exchangeCode: () => Promise.reject(new Error("not available in jobs")),
      refresh: (refreshToken) =>
        refreshAccessToken({ apiBaseUrl: mp.apiBaseUrl, clientId: mp.clientId, clientSecret: mp.clientSecret }, refreshToken),
    },
    config: { authBaseUrl: mp.authBaseUrl, clientId: mp.clientId, redirectUri: mp.redirectUri },
  };

  const paymentEvents: PaymentEventDeps = {
    db,
    async getAccessTokenForCollector(collectorId) {
      const owner = await db.mercadoPagoConnection.findFirst({
        where: { mercadoPagoUserId: collectorId, status: "ACTIVE" },
        select: { userId: true },
      });
      return owner ? { accessToken: (await getActiveAccessToken(connection, owner.userId)).accessToken } : null;
    },
    getPayment: (accessToken, paymentId) => getPayment({ apiBaseUrl: mp.apiBaseUrl }, accessToken, paymentId),
  };

  return {
    env,
    db,
    logger,
    meli: createMercadoLibreClient({
      baseUrl: meliSettings.apiBaseUrl,
      clientId: meliSettings.clientId,
      clientSecret: meliSettings.clientSecret,
    }),
    paymentEvents,
  };
}

/** Runs a job and maps the outcome to a process exit code (0 ok, 1 systemic failure). */
export async function runJob(logger: Logger, disconnect: () => Promise<void>, job: () => Promise<unknown>) {
  const started = Date.now();
  try {
    const result = await job();
    logger.info({ result, ms: Date.now() - started }, "job completed");
    process.exitCode = 0;
  } catch (error) {
    logger.error({ err: error, ms: Date.now() - started }, "job failed");
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
}
