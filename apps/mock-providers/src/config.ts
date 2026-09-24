/** Mock server configuration. Every value has a local default. */
export const config = {
  port: Number(process.env.PORT ?? 4010),
  /** Base URL browsers use to reach this server. */
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:4010").replace(/\/$/, ""),
  /**
   * When set, webhook notification URLs are re-targeted to this origin
   * (e.g. http://web:3000 inside Docker, where "localhost" is the mock container).
   */
  webhookTargetOrigin: process.env.WEBHOOK_TARGET_ORIGIN ?? "",
  google: {
    clientId: process.env.MOCK_GOOGLE_CLIENT_ID ?? "mock-google-client",
    clientSecret: process.env.MOCK_GOOGLE_CLIENT_SECRET ?? "mock-google-secret",
  },
  meli: {
    clientId: process.env.MOCK_MELI_CLIENT_ID ?? "mock-meli-client",
    clientSecret: process.env.MOCK_MELI_CLIENT_SECRET ?? "mock-meli-secret",
  },
  mp: {
    clientId: process.env.MOCK_MP_CLIENT_ID ?? "mock-mp-client",
    clientSecret: process.env.MOCK_MP_CLIENT_SECRET ?? "mock-mp-secret",
    webhookSecret: process.env.MOCK_MP_WEBHOOK_SECRET ?? "mock-mp-webhook-secret",
  },
};
