import "server-only";

import { hashClientIp } from "@quieroeso/domain";
import { getEnv } from "./env";

/**
 * Client IP as reported by the edge proxy (Railway sets X-Forwarded-For; the first
 * entry is the original client). Only ever used hashed; never logged or stored raw.
 */
export function clientIpHash(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return hashClientIp(ip, getEnv().IP_HASH_SECRET);
}
