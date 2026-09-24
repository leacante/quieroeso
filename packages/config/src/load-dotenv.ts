import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads the monorepo root `.env` into `process.env` for local development.
 * Existing variables win, and nothing happens when the file is absent
 * (containers and Railway inject variables directly).
 */
export function loadRootDotenv(fromDirectory: string): void {
  let directory = fromDirectory;
  for (let depth = 0; depth < 5; depth++) {
    if (existsSync(path.join(directory, "pnpm-workspace.yaml"))) {
      const file = path.join(directory, ".env");
      if (existsSync(file)) process.loadEnvFile(file);
      return;
    }
    directory = path.dirname(directory);
  }
}
