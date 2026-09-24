"use client";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Same-origin JSON request. Errors in `application/problem+json` become ApiError
 * with the user-facing `detail` as message and per-field messages.
 */
export async function apiRequest<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "No hay conexión. Revisá tu internet y probá de nuevo.");
  }
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = (payload ?? {}) as {
      code?: string;
      detail?: string;
      fields?: Record<string, string>;
    };
    throw new ApiError(
      response.status,
      problem.code ?? "UNKNOWN",
      problem.detail ?? "Algo salió mal. Probá de nuevo.",
      problem.fields ?? {},
    );
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Algo salió mal. Probá de nuevo.";
}
