/**
 * Housekeeping: expired rate-limit windows and OAuth states, plus retries of
 * acknowledged but unprocessed webhooks. Also runs at the end of refresh-products.
 */
import { processPendingWebhookEvents, purgeExpiredSecurityRecords } from "@quieroeso/domain";
import { createJobRuntime, runJob } from "./runtime";

const runtime = createJobRuntime("cleanup");

await runJob(runtime.logger, () => runtime.db.$disconnect(), async () => ({
  purged: await purgeExpiredSecurityRecords(runtime.db),
  webhooks: await processPendingWebhookEvents(runtime.paymentEvents),
}));
