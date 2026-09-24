import { loadRootDotenv } from "@quieroeso/config/load-dotenv";

loadRootDotenv(import.meta.dirname);
// Every integration test talks to the dedicated test database only.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.LOG_LEVEL ??= "silent";
