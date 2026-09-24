import {
  pino,
  stdSerializers,
  stdTimeFunctions,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";

export type { Logger } from "pino";

/**
 * Keys that must never reach a log line. Matched at any depth up to three levels
 * (pino redaction paths do not support recursive wildcards).
 */
const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "shareToken",
  "token",
  "code_verifier",
  "codeVerifier",
  "client_secret",
  "password",
  "secret",
  "contributorMessage",
  "x-signature",
];

function redactPaths(): string[] {
  return SENSITIVE_KEYS.flatMap((key) => {
    const isIdentifier = /^[A-Za-z_$][\w$]*$/.test(key);
    const child = isIdentifier ? `.${key}` : `["${key}"]`;
    return [isIdentifier ? key : `["${key}"]`, `*${child}`, `*.*${child}`];
  });
}

export const REDACT_PATHS = redactPaths();

export type CreateLoggerOptions = {
  level?: LoggerOptions["level"];
  name?: string;
  destination?: DestinationStream;
};

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return pino(
    {
      name: options.name ?? "quieroeso",
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      base: { service: options.name ?? "quieroeso" },
      timestamp: stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      serializers: {
        err: stdSerializers.err,
      },
    },
    options.destination,
  );
}

let rootLogger: Logger | undefined;

/** Process-wide logger, created on first use. */
export function getLogger(): Logger {
  rootLogger ??= createLogger({ name: process.env.SERVICE_NAME ?? "quieroeso" });
  return rootLogger;
}

/**
 * Shortens a secret-bearing value (share token, URL path) to a non-reversible
 * prefix suitable for correlating log lines.
 */
export function fingerprint(value: string): string {
  return value.length <= 6 ? "[short]" : `${value.slice(0, 4)}…`;
}
