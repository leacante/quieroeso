import { loadRootDotenv } from "@quieroeso/config/load-dotenv";
import { migrateTestDatabase } from "@quieroeso/db/testing";

/** Vitest global setup for integration tests: migrates the test database once. */
export default function setup(): void {
  loadRootDotenv(import.meta.dirname);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for integration tests (see .env.example).");
  }
  migrateTestDatabase(url);
}
