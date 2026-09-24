import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = createLogger({ level: "info", destination });
  return { logger, lines };
}

describe("createLogger", () => {
  it("redacts secrets at the top level and nested", () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        authorization: "Bearer abc",
        accessToken: "APP_USR-123",
        headers: { cookie: "session=1", authorization: "Bearer def" },
        connection: { tokens: { refreshToken: "TG-456" } },
        shareToken: "s3cr3t",
        contributorMessage: "feliz cumple",
      },
      "hello",
    );
    const output = lines.join("");
    for (const secret of [
      "Bearer abc",
      "APP_USR-123",
      "session=1",
      "Bearer def",
      "TG-456",
      "s3cr3t",
      "feliz cumple",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("hello");
  });
});
