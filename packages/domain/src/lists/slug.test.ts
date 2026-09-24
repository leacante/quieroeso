import { describe, expect, it } from "vitest";
import { generateListSlug, slugify } from "./slug";

describe("slugs", () => {
  it("normalizes accents and punctuation", () => {
    expect(slugify("¡Cumple de Ñandú 2026!")).toBe("cumple-de-nandu-2026");
  });

  it("falls back for empty titles", () => {
    expect(slugify("🎁🎁")).toBe("lista");
  });

  it("appends a random suffix", () => {
    const slug = generateListSlug("Casamiento de Ana y Bruno");
    expect(slug).toMatch(/^casamiento-de-ana-y-bruno-[a-z0-9]{6}$/);
    expect(generateListSlug("x")).not.toBe(generateListSlug("x"));
  });
});
