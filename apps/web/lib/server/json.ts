/** JSON response that serializes bigint money values as decimal strings. */
export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const body = JSON.stringify(data, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(body, { ...init, headers });
}
