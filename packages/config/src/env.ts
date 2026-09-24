import { z } from "zod";

const TOKEN_KEY_PATTERN = /^TOKEN_ENCRYPTION_KEY_V(\d+)$/;

const aes256Key = z
  .string()
  .base64()
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "must be a base64 encoded 32-byte key",
  });

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((value) => value === "true" || value === "1");

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Deployment environment, independent from NODE_ENV (a local Docker build runs NODE_ENV=production). */
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    APP_URL: z.url(),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    MELI_CLIENT_ID: optionalString,
    MELI_CLIENT_SECRET: optionalString,
    MELI_API_BASE_URL: z.url().default("https://api.mercadolibre.com"),
    MP_CLIENT_ID: optionalString,
    MP_CLIENT_SECRET: optionalString,
    MP_WEBHOOK_SECRET: optionalString,
    MP_AUTH_BASE_URL: z.url().default("https://auth.mercadopago.com"),
    MP_API_BASE_URL: z.url().default("https://api.mercadopago.com"),
    /** Hosts a Checkout Pro redirect may point to. */
    MP_CHECKOUT_HOSTS: z
      .string()
      .default("www.mercadopago.com.ar,mercadopago.com.ar,sandbox.mercadopago.com.ar")
      .transform((value) =>
        value
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean),
      ),
    /** Enables the local mock server for Google, Mercado Libre and Mercado Pago. Never in production. */
    MOCK_PROVIDERS: booleanFlag,
    /** URL of the mock server as seen by the browser. */
    MOCK_PROVIDERS_PUBLIC_URL: z.url().optional(),
    /** URL of the mock server as seen by the web/jobs processes. */
    MOCK_PROVIDERS_INTERNAL_URL: z.url().optional(),
    ACTIVE_TOKEN_KEY_VERSION: z.coerce.number().int().positive(),
    IP_HASH_SECRET: z.string().min(32),
    MIN_CONTRIBUTION_MINOR: z.coerce.bigint().positive().default(100000n),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.MOCK_PROVIDERS) {
      if (env.APP_ENV === "production" || env.APP_ENV === "staging") {
        ctx.addIssue({
          code: "custom",
          path: ["MOCK_PROVIDERS"],
          message: "mock providers cannot be enabled in staging or production",
        });
      }
      for (const key of ["MOCK_PROVIDERS_PUBLIC_URL", "MOCK_PROVIDERS_INTERNAL_URL"] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required when MOCK_PROVIDERS=true",
          });
        }
      }
      return;
    }
    const required = [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "MELI_CLIENT_ID",
      "MELI_CLIENT_SECRET",
      "MP_CLIENT_ID",
      "MP_CLIENT_SECRET",
      "MP_WEBHOOK_SECRET",
    ] as const;
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "required unless MOCK_PROVIDERS=true",
        });
      }
    }
  });

export type ServerEnvironment = z.output<typeof serverEnvSchema>;

export type AppEnvironment = ServerEnvironment & {
  /** AES-256 keys indexed by version. */
  tokenEncryptionKeys: ReadonlyMap<number, Buffer>;
};

export class EnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "EnvironmentError";
  }
}

type RawEnvironment = Record<string, string | undefined>;

function parseTokenKeys(raw: RawEnvironment): { keys: Map<number, Buffer>; issues: string[] } {
  const keys = new Map<number, Buffer>();
  const issues: string[] = [];
  for (const [name, value] of Object.entries(raw)) {
    const match = TOKEN_KEY_PATTERN.exec(name);
    if (!match?.[1] || value === undefined || value === "") continue;
    const parsed = aes256Key.safeParse(value);
    if (!parsed.success) {
      issues.push(`${name}: must be a base64 encoded 32-byte key`);
      continue;
    }
    keys.set(Number(match[1]), Buffer.from(parsed.data, "base64"));
  }
  return { keys, issues };
}

/** Validates a raw environment. Error messages name variables but never echo their values. */
export function parseEnvironment(raw: RawEnvironment): AppEnvironment {
  const parsed = serverEnvSchema.safeParse(raw);
  const { keys, issues } = parseTokenKeys(raw);

  if (parsed.success && !keys.has(parsed.data.ACTIVE_TOKEN_KEY_VERSION)) {
    issues.push(
      `TOKEN_ENCRYPTION_KEY_V${parsed.data.ACTIVE_TOKEN_KEY_VERSION}: required by ACTIVE_TOKEN_KEY_VERSION`,
    );
  }
  if (!parsed.success) {
    issues.unshift(
      ...parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }
  if (!parsed.success || issues.length > 0) {
    throw new EnvironmentError(issues);
  }
  return { ...parsed.data, tokenEncryptionKeys: keys };
}

let cached: AppEnvironment | undefined;

/**
 * Lazily reads and validates `process.env` on first use, so importing this module
 * (e.g. transitively from a client bundle) never reads secrets.
 */
export function getEnv(): AppEnvironment {
  cached ??= parseEnvironment(process.env);
  return cached;
}

/** Test helper: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}
