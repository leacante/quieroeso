import { DomainError } from "@quieroeso/domain";
import { describe, expect, it, vi } from "vitest";
import { toProblemResponse } from "./server/problem";

vi.mock("./auth", () => ({ getAuth: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { createRequireUser } = await import("./session");

const ana = { id: "user_ana", name: "Ana", email: "ana@example.com", image: null };

describe("requireUser", () => {
  it("resolves the user of a valid session", async () => {
    const requireUser = createRequireUser(async (headers) =>
      headers.get("cookie")?.includes("quieroeso.session_token=valid") ? ana : null,
    );
    const request = new Request("http://localhost:3000/api/lists", {
      headers: { cookie: "quieroeso.session_token=valid" },
    });
    await expect(requireUser(request)).resolves.toEqual(ana);
  });

  it("produces a 401 problem, not a redirect, when the cookie is missing", async () => {
    const requireUser = createRequireUser(async () => null);
    const request = new Request("http://localhost:3000/api/lists");

    const error = await requireUser(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);

    const response = toProblemResponse(request, error);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      instance: "/api/lists",
    });
  });
});
