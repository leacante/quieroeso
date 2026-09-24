/**
 * Only same-site relative paths are allowed as post-login destinations, which
 * prevents open redirects through `?next=`.
 */
export function safeReturnPath(value: string | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
