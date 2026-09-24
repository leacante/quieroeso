import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createTokenVault,
  parseEnvelope,
  serializeEnvelope,
  sha256Hex,
  TokenVaultError,
} from "./token-vault";

const keyV1 = randomBytes(32);
const keyV2 = randomBytes(32);

describe("token vault", () => {
  it("round-trips a secret", () => {
    const vault = createTokenVault(new Map([[1, keyV1]]), 1);
    const envelope = vault.encrypt("APP_USR-123", "mp:access:user_1");
    expect(envelope).not.toContain("APP_USR");
    expect(vault.decrypt(envelope, "mp:access:user_1")).toBe("APP_USR-123");
  });

  it("uses a fresh IV per encryption", () => {
    const vault = createTokenVault(new Map([[1, keyV1]]), 1);
    expect(vault.encrypt("same", "ctx")).not.toBe(vault.encrypt("same", "ctx"));
  });

  it("detects tampered ciphertext", () => {
    const vault = createTokenVault(new Map([[1, keyV1]]), 1);
    const envelope = parseEnvelope(vault.encrypt("secret", "ctx"));
    envelope.ciphertext[0] = (envelope.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => vault.decrypt(serializeEnvelope(envelope), "ctx")).toThrow(TokenVaultError);
  });

  it("rejects a ciphertext moved to another context", () => {
    const vault = createTokenVault(new Map([[1, keyV1]]), 1);
    const envelope = vault.encrypt("secret", "mp:access:user_1");
    expect(() => vault.decrypt(envelope, "mp:access:user_2")).toThrow(TokenVaultError);
  });

  it("reads older key versions after rotation and encrypts with the active one", () => {
    const old = createTokenVault(new Map([[1, keyV1]]), 1);
    const envelope = old.encrypt("secret", "ctx");

    const rotated = createTokenVault(
      new Map([
        [1, keyV1],
        [2, keyV2],
      ]),
      2,
    );
    expect(rotated.decrypt(envelope, "ctx")).toBe("secret");
    expect(rotated.needsRotation(envelope)).toBe(true);
    expect(parseEnvelope(rotated.encrypt("secret", "ctx")).version).toBe(2);
  });

  it("fails for unknown versions and malformed envelopes", () => {
    const vault = createTokenVault(new Map([[2, keyV2]]), 2);
    const other = createTokenVault(new Map([[1, keyV1]]), 1).encrypt("secret", "ctx");
    expect(() => vault.decrypt(other, "ctx")).toThrow(/unknown key version/);
    expect(() => vault.decrypt("not-an-envelope", "ctx")).toThrow(TokenVaultError);
  });

  it("refuses keys that are not 32 bytes", () => {
    expect(() => createTokenVault(new Map([[1, randomBytes(16)]]), 1)).toThrow(TokenVaultError);
  });

  it("hashes deterministically", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
