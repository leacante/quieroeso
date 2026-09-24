import { randomBytes } from "node:crypto";

const MAX_BASE_LENGTH = 60;

export function slugify(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, "");
  return base || "lista";
}

/**
 * Stable public slug: generated once at creation and never changed by title edits,
 * so shared URLs keep working. The random suffix avoids enumeration by title.
 */
export function generateListSlug(title: string): string {
  const suffix = randomBytes(5)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x");
  return `${slugify(title)}-${suffix.slice(0, 6)}`;
}
