/**
 * QuieroEso infrastructure on Railway (Infrastructure as Code).
 * Plan with `railway config plan`; apply only after reviewing the plan.
 * Secrets are never written here: `preserve()` keeps the values set in Railway.
 * See docs/operations/railway.md.
 */
import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

/** Single region close to Argentina with private networking to PostgreSQL. */
const REGION = "us-east4";

/** GitHub repository ("owner/name") to deploy, provided when planning. */
const REPOSITORY = process.env.QUIEROESO_GITHUB_REPO;
if (!REPOSITORY) {
  throw new Error("Set QUIEROESO_GITHUB_REPO=owner/name before running railway config plan.");
}

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");
  const source = github(REPOSITORY, { branch: production ? "main" : "staging" });

  const db = postgres("postgres", { region: REGION });

  const web = service("web", {
    source,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/Dockerfile",
      watchPatterns: ["apps/web/**", "packages/**", "pnpm-lock.yaml", "docker/web/**"],
    },
    // Runs in the web image before traffic switches (docker/web/migrate.sh).
    preDeploy: "migrate",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    deploy: { region: REGION, restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5 },
    env: {
      NODE_ENV: "production",
      APP_ENV: production ? "production" : "staging",
      LOG_LEVEL: "info",
      MOCK_PROVIDERS: "false",
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: preserve(),
      BETTER_AUTH_URL: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      MELI_CLIENT_ID: preserve(),
      MELI_CLIENT_SECRET: preserve(),
      MP_CLIENT_ID: preserve(),
      MP_CLIENT_SECRET: preserve(),
      MP_WEBHOOK_SECRET: preserve(),
      TOKEN_ENCRYPTION_KEY_V1: preserve(),
      ACTIVE_TOKEN_KEY_VERSION: "1",
      IP_HASH_SECRET: preserve(),
      MIN_CONTRIBUTION_MINOR: "100000",
    },
  });

  const refreshProducts = service("jobs-refresh-products", {
    source,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/jobs/Dockerfile",
      watchPatterns: ["apps/jobs/**", "packages/**", "pnpm-lock.yaml"],
    },
    // Off the hour to avoid the top-of-hour rush on shared infrastructure.
    deploy: { region: REGION, cronSchedule: "17 */6 * * *", restartPolicyType: "NEVER" },
    env: {
      NODE_ENV: "production",
      APP_ENV: production ? "production" : "staging",
      LOG_LEVEL: "info",
      MOCK_PROVIDERS: "false",
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: web.env.APP_URL,
      BETTER_AUTH_URL: web.env.BETTER_AUTH_URL,
      BETTER_AUTH_SECRET: web.env.BETTER_AUTH_SECRET,
      MELI_CLIENT_ID: web.env.MELI_CLIENT_ID,
      MELI_CLIENT_SECRET: web.env.MELI_CLIENT_SECRET,
      MP_CLIENT_ID: web.env.MP_CLIENT_ID,
      MP_CLIENT_SECRET: web.env.MP_CLIENT_SECRET,
      MP_WEBHOOK_SECRET: web.env.MP_WEBHOOK_SECRET,
      GOOGLE_CLIENT_ID: web.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: web.env.GOOGLE_CLIENT_SECRET,
      TOKEN_ENCRYPTION_KEY_V1: web.env.TOKEN_ENCRYPTION_KEY_V1,
      ACTIVE_TOKEN_KEY_VERSION: web.env.ACTIVE_TOKEN_KEY_VERSION,
      IP_HASH_SECRET: web.env.IP_HASH_SECRET,
    },
  });

  return project("quieroeso", { resources: [db, web, refreshProducts] });
});
