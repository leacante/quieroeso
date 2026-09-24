import type { IncomingMessage, ServerResponse } from "node:http";

export type Request = {
  method: string;
  url: URL;
  headers: IncomingMessage["headers"];
  body: string;
};

export type Route = {
  method: string;
  pattern: RegExp;
  handler: (request: Request, params: string[], response: ServerResponse) => Promise<void> | void;
};

const MAX_BODY_BYTES = 64 * 1024;

export async function readRequest(incoming: IncomingMessage, baseUrl: string): Promise<Request> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of incoming) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(buffer);
  }
  return {
    method: incoming.method ?? "GET",
    url: new URL(incoming.url ?? "/", baseUrl),
    headers: incoming.headers,
    body: Buffer.concat(chunks).toString("utf8"),
  };
}

/** Parses JSON or x-www-form-urlencoded bodies into a flat record. */
export function parseBody(request: Request): Record<string, unknown> {
  const type = request.headers["content-type"] ?? "";
  if (request.body === "") return {};
  if (type.includes("application/json")) {
    const parsed: unknown = JSON.parse(request.body);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  }
  return Object.fromEntries(new URLSearchParams(request.body));
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Client credentials from HTTP Basic auth or the request body. */
export function clientCredentials(
  request: Request,
  body: Record<string, unknown>,
): { clientId: string; clientSecret: string } {
  const header = request.headers.authorization ?? "";
  if (header.startsWith("Basic ")) {
    const [clientId = "", clientSecret = ""] = Buffer.from(header.slice(6), "base64")
      .toString("utf8")
      .split(":")
      .map(decodeURIComponent);
    return { clientId, clientSecret };
  }
  return { clientId: String(body.client_id ?? ""), clientSecret: String(body.client_secret ?? "") };
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

export function redirect(response: ServerResponse, location: string, status = 302): void {
  response.writeHead(status, { Location: location, "Cache-Control": "no-store" });
  response.end();
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
