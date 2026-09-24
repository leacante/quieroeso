import { describe, expect, it } from "vitest";
import { EnvironmentError, parseEnvironment } from "./env";

const validKey = Buffer.alloc(32, 7).toString("base64");

const base = {
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://quieroeso:quieroeso@localhost:5432/quieroeso",
  BETTER_AUTH_SECRET: "x".repeat(32),
  IP_HASH_SECRET: "y".repeat(32),
  TOKEN_ENCRYPTION_KEY_V1: validKey,
  ACTIVE_TOKEN_KEY_VERSION: "1",
  MOCK_PROVIDERS: "true",
  MOCK_PROVIDERS_PUBLIC_URL: "http://localhost:4010",
  MOCK_PROVIDERS_INTERNAL_URL: "http://mocks:4010",
};

function issuesOf(raw: Record<string, string | undefined>): string[] {
  try {
    parseEnvironment(raw);
    return [];
  } catch (error) {
    if (error instanceof EnvironmentError) return error.issues;
    throw error;
  }
}

describe("parseEnvironment", () => {
  it("accepts a valid local environment and applies defaults", () => {
    const env = parseEnvironment(base);
    expect(env.MIN_CONTRIBUTION_MINOR).toBe(100000n);
    expect(env.tokenEncryptionKeys.get(1)).toHaveLength(32);
    expect(env.MP_CHECKOUT_HOSTS).toContain("www.mercadopago.com.ar");
  });

  it("rejects a short auth secret", () => {
    expect(issuesOf({ ...base, BETTER_AUTH_SECRET: "short" })).toEqual([
      expect.stringContaining("BETTER_AUTH_SECRET"),
    ]);
  });

  it("rejects AES keys that are not 32 bytes", () => {
    const shortKey = Buffer.alloc(16, 1).toString("base64");
    const issues = issuesOf({ ...base, TOKEN_ENCRYPTION_KEY_V1: shortKey });
    expect(issues).toContain("TOKEN_ENCRYPTION_KEY_V1: must be a base64 encoded 32-byte key");
  });

  it("requires the key for the active version", () => {
    expect(issuesOf({ ...base, ACTIVE_TOKEN_KEY_VERSION: "2" })).toEqual([
      expect.stringContaining("TOKEN_ENCRYPTION_KEY_V2"),
    ]);
  });

  it("rejects invalid URLs", () => {
    expect(issuesOf({ ...base, APP_URL: "not a url" })).toEqual([
      expect.stringContaining("APP_URL"),
    ]);
  });

  it("requires provider credentials when mocks are disabled", () => {
    const issues = issuesOf({ ...base, MOCK_PROVIDERS: "false" });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("GOOGLE_CLIENT_ID"),
        expect.stringContaining("MP_WEBHOOK_SECRET"),
      ]),
    );
  });

  it("refuses mock providers in production", () => {
    expect(issuesOf({ ...base, APP_ENV: "production" })).toEqual([
      expect.stringContaining("MOCK_PROVIDERS"),
    ]);
  });

  it("never echoes secret values in error messages", () => {
    const secret = "super-secret-but-short";
    const issues = issuesOf({ ...base, BETTER_AUTH_SECRET: secret });
    expect(issues.join("\n")).not.toContain(secret);
  });
});
