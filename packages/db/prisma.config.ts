import { loadRootDotenv } from "@quieroeso/config/load-dotenv";
import { defineConfig } from "prisma/config";

loadRootDotenv(import.meta.dirname);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` does not connect, so it must work without DATABASE_URL
    // (e.g. in Docker build stages). Commands that connect fail fast on the empty URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
