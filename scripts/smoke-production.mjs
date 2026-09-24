#!/usr/bin/env node
// Post-deploy smoke test. Usage: node scripts/smoke-production.mjs https://quieroeso.app
// Read-only: it never signs in or creates real payments. The checkout check sends an
// invalid request and expects validation to reject it, proving the route is alive.
const base = new URL(process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000");
const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, init) {
  return fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
}

await check("home renders", async () => {
  const response = await get("/");
  assert(response.status === 200, `status ${response.status}`);
  assert((await response.text()).includes("QuieroEso"), "missing brand");
});

await check("healthcheck ok", async () => {
  const response = await get("/api/health");
  const body = await response.json();
  assert(
    response.status === 200 && body.database === "ok",
    `status ${response.status} ${JSON.stringify(body)}`,
  );
});

await check("login page", async () => {
  const response = await get("/login");
  assert(response.status === 200, `status ${response.status}`);
  assert((await response.text()).includes("Continuar con Google"), "missing Google button");
});

await check("dashboard requires session", async () => {
  const response = await get("/dashboard/lists");
  assert([302, 307].includes(response.status), `status ${response.status}`);
  assert(response.headers.get("location")?.includes("/login"), "not redirected to login");
});

let publicListPath = null;
await check("sitemap lists only public URLs", async () => {
  const response = await get("/sitemap.xml");
  const xml = await response.text();
  assert(response.status === 200, `status ${response.status}`);
  assert(!xml.includes("/s/"), "sitemap exposes secret links");
  publicListPath = xml.match(/<loc>[^<]*(\/l\/[^<]+)<\/loc>/)?.[1] ?? null;
});

await check("public list page (if any)", async () => {
  if (!publicListPath) return;
  const response = await get(publicListPath);
  const html = await response.text();
  assert(response.status === 200, `status ${response.status}`);
  assert(html.includes("application/ld+json"), "missing JSON-LD");
  assert(html.includes('property="og:image"'), "missing Open Graph image");
});

await check("security headers", async () => {
  const response = await get("/");
  assert(response.headers.get("x-content-type-options") === "nosniff", "missing nosniff");
  assert(response.headers.get("x-frame-options") === "DENY", "missing frame protection");
  if (base.protocol === "https:") {
    const cookie = (await get("/api/auth/get-session")).headers.get("set-cookie") ?? "";
    assert(!cookie || cookie.includes("Secure"), "cookie without Secure");
  }
});

await check("checkout endpoint alive (validation only)", async () => {
  const response = await get("/api/contributions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base.origin,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ listItemId: "smoke", amountMinor: "1" }),
  });
  assert(response.status === 422, `expected 422, got ${response.status}`);
  assert(
    response.headers.get("content-type")?.includes("application/problem+json"),
    "not problem+json",
  );
});

await check("webhook rejects unsigned calls", async () => {
  const response = await get("/api/webhooks/mercadopago?data.id=1&type=payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert(response.status === 401, `expected 401, got ${response.status}`);
});

for (const result of results) {
  const mark = result.ok ? "PASS" : "FAIL";
  console.log(
    `${mark}  ${result.name} (${result.ms} ms)${result.error ? ` — ${result.error}` : ""}`,
  );
}
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${base.origin}`);
process.exit(failed === 0 ? 0 : 1);
