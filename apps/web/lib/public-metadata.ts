import type { PublicListView } from "@quieroeso/domain";

const MAX_DESCRIPTION = 180;

/** Short, owner-agnostic description for meta tags and previews. */
export function listDescription(list: Pick<PublicListView, "description" | "items">): string {
  const base =
    list.description?.trim() ||
    `Lista de deseos con ${list.items.length} ${list.items.length === 1 ? "producto" : "productos"}.`;
  const text = `${base} Mirala y regalá algo en QuieroEso.`;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}…` : text;
}
