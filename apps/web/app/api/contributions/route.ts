import { createContribution, createContributionSchema, DomainError } from "@quieroeso/domain";
import { jsonResponse } from "@/lib/server/json";
import { readJsonBody } from "@/lib/server/problem";
import { assertSameOrigin, handle } from "@/lib/server/route";
import { getContributionDeps } from "@/lib/server/services";

const MAX_BODY_BYTES = 16 * 1024;
const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public (no account needed): creates a contribution and returns the Checkout Pro URL. */
export const POST = handle(async (request) => {
  assertSameOrigin(request);
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new DomainError("VALIDATION_FAILED", "Falta el encabezado Idempotency-Key (UUID).");
  }
  const input = createContributionSchema.parse(await readJsonBody(request, MAX_BODY_BYTES));
  const result = await createContribution(getContributionDeps(), input, idempotencyKey.toLowerCase());
  return jsonResponse(result, { status: 201 });
});
