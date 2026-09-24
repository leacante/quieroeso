/**
 * Cron: `17 *\/6 * * *` (Railway service jobs-refresh-products).
 * Refreshes Mercado Libre snapshots older than 12 hours and retries webhook
 * events that were acknowledged but not processed, then purges expired
 * rate-limit windows and OAuth states.
 */
import {
  processPendingWebhookEvents,
  purgeExpiredSecurityRecords,
  refreshStaleProducts,
} from "@quieroeso/domain";
import { createJobRuntime, runJob } from "./runtime";

const runtime = createJobRuntime("refresh-products");

await runJob(
  runtime.logger,
  () => runtime.db.$disconnect(),
  async () => {
    const products = await refreshStaleProducts(
      { db: runtime.db, meli: runtime.meli },
      { batchSize: 50, concurrency: 5 },
    );
    const webhooks = await processPendingWebhookEvents(runtime.paymentEvents);
    const purged = await purgeExpiredSecurityRecords(runtime.db);
    return { products, webhooks, purged };
  },
);
