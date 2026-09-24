#!/usr/bin/env node
// Creates `.env` from `.env.example` with fresh local secrets. Refuses to overwrite.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("../.env", import.meta.url);
if (existsSync(target)) {
  console.error(".env already exists; leaving it untouched.");
  process.exit(0);
}

const replacements = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  TOKEN_ENCRYPTION_KEY_V1: randomBytes(32).toString("base64"),
  IP_HASH_SECRET: randomBytes(32).toString("base64url"),
};

const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const content = example.replace(/^(\w+)=.*$/gm, (line, key) =>
  key in replacements ? `${key}=${replacements[key]}` : line,
);
writeFileSync(target, content, { mode: 0o600 });
console.error("Created .env with fresh local secrets.");
