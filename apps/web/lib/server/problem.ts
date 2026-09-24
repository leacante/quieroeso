import { DomainError } from "@quieroeso/domain";
import { getLogger } from "@quieroeso/observability";
import { z } from "zod";

/** RFC 9457 problem details, as defined in the MVP plan. */
export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  fields?: Record<string, string>;
};

const TITLES: Record<number, string> = {
  400: "Solicitud inválida",
  401: "Necesitás iniciar sesión",
  403: "No tenés permiso",
  404: "No encontrado",
  409: "Conflicto",
  413: "Solicitud demasiado grande",
  415: "Tipo de contenido no soportado",
  422: "Datos inválidos",
  429: "Demasiadas solicitudes",
  500: "Error interno",
  503: "Servicio no disponible",
};

export function problemResponse(
  request: Request,
  status: number,
  code: string,
  detail: string,
  init: { fields?: Record<string, string>; headers?: HeadersInit } = {},
): Response {
  const body: ApiProblem = {
    type: `about:blank#${code.toLowerCase()}`,
    title: TITLES[status] ?? "Error",
    status,
    detail,
    instance: new URL(request.url).pathname,
    code,
    ...(init.fields ? { fields: init.fields } : {}),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Maps thrown errors to problem responses. Unexpected errors are logged and hidden. */
export function toProblemResponse(request: Request, error: unknown): Response {
  if (error instanceof DomainError) {
    const headers: Record<string, string> = {};
    if (error.extra.retryAfterSeconds !== undefined) {
      headers["Retry-After"] = String(error.extra.retryAfterSeconds);
    }
    return problemResponse(request, error.status, error.code, error.detail, {
      fields: error.extra.fields,
      headers,
    });
  }
  if (error instanceof z.ZodError) {
    return problemResponse(request, 422, "VALIDATION_FAILED", "Revisá los datos ingresados.", {
      fields: zodFields(error),
    });
  }
  if (error instanceof RequestBodyError) {
    return problemResponse(request, error.status, error.code, error.message);
  }
  getLogger().error(
    { err: error, path: new URL(request.url).pathname, method: request.method },
    "unhandled route error",
  );
  return problemResponse(request, 500, "INTERNAL_ERROR", "Ocurrió un error inesperado.");
}

export class RequestBodyError extends Error {
  constructor(
    readonly status: 400 | 413 | 415,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Reads a JSON body enforcing a byte limit (the stream is cut off at the limit,
 * so a missing or lying Content-Length cannot bypass it).
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new RequestBodyError(415, "UNSUPPORTED_MEDIA_TYPE", "Enviá el cuerpo como JSON.");
  }
  const text = await readTextBody(request, maxBytes);
  try {
    return text === "" ? {} : JSON.parse(text);
  } catch {
    throw new RequestBodyError(400, "INVALID_JSON", "El cuerpo no es JSON válido.");
  }
}

export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new RequestBodyError(413, "PAYLOAD_TOO_LARGE", "La solicitud es demasiado grande.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError(413, "PAYLOAD_TOO_LARGE", "La solicitud es demasiado grande.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
