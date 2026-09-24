import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Parsed form of a stored secret: `{version}.{iv}.{tag}.{ciphertext}` (base64url parts). */
export type Envelope = {
  version: number;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
};

export class TokenVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenVaultError";
  }
}

export type TokenVault = {
  readonly activeVersion: number;
  /**
   * Encrypts with the active key. `context` is bound as additional authenticated
   * data, so a ciphertext copied to another row/purpose fails to decrypt.
   */
  encrypt(plaintext: string, context: string): string;
  decrypt(serialized: string, context: string): string;
  /** True when the envelope was produced with an older key and should be re-encrypted. */
  needsRotation(serialized: string): boolean;
};

export function serializeEnvelope(envelope: Envelope): string {
  return [
    envelope.version,
    envelope.iv.toString("base64url"),
    envelope.tag.toString("base64url"),
    envelope.ciphertext.toString("base64url"),
  ].join(".");
}

export function parseEnvelope(serialized: string): Envelope {
  const parts = serialized.split(".");
  if (parts.length !== 4) throw new TokenVaultError("malformed envelope");
  const [version, iv, tag, ciphertext] = parts as [string, string, string, string];
  const parsedVersion = Number(version);
  if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
    throw new TokenVaultError("malformed envelope version");
  }
  const envelope = {
    version: parsedVersion,
    iv: Buffer.from(iv, "base64url"),
    tag: Buffer.from(tag, "base64url"),
    ciphertext: Buffer.from(ciphertext, "base64url"),
  };
  if (envelope.iv.length !== IV_BYTES || envelope.tag.length !== TAG_BYTES) {
    throw new TokenVaultError("malformed envelope");
  }
  return envelope;
}

export function createTokenVault(
  keys: ReadonlyMap<number, Buffer>,
  activeVersion: number,
): TokenVault {
  for (const [version, key] of keys) {
    if (key.length !== 32) throw new TokenVaultError(`key v${version} must be 32 bytes`);
  }
  const activeKey = keys.get(activeVersion);
  if (!activeKey) throw new TokenVaultError(`missing active key v${activeVersion}`);

  return {
    activeVersion,
    encrypt(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, activeKey, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return serializeEnvelope({
        version: activeVersion,
        iv,
        tag: cipher.getAuthTag(),
        ciphertext,
      });
    },
    decrypt(serialized, context) {
      const envelope = parseEnvelope(serialized);
      const key = keys.get(envelope.version);
      if (!key) throw new TokenVaultError(`unknown key version v${envelope.version}`);
      try {
        const decipher = createDecipheriv(ALGORITHM, key, envelope.iv, {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(envelope.tag);
        return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString(
          "utf8",
        );
      } catch {
        throw new TokenVaultError("ciphertext failed authentication");
      }
    },
    needsRotation(serialized) {
      return parseEnvelope(serialized).version !== activeVersion;
    },
  };
}

/** Random URL-safe token (default 32 bytes of entropy). */
export function generateSecretToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex digest used to look up secrets without storing them. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
