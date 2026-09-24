"use client";

import { Alert } from "@quieroeso/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, errorMessage } from "@/lib/client/api";
import { EditorItemCard, type EditorItem } from "./editor-item-card";

export function EditorItemList({
  listId,
  items: initialItems,
}: {
  listId: string;
  items: EditorItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [previous, setPrevious] = useState(initialItems);

  // Server refreshes (after add/edit/delete) replace local state.
  if (initialItems !== previous) {
    setPrevious(initialItems);
    setItems(initialItems);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    const before = items;
    setItems(next);
    setMoving(true);
    setError(null);
    try {
      await apiRequest("PUT", `/api/lists/${listId}/items`, {
        itemIds: next.map((item) => item.id),
      });
      setAnnouncement(`"${moved.title}" quedó en la posición ${target + 1} de ${next.length}.`);
      router.refresh();
    } catch (caught) {
      setItems(before);
      setError(errorMessage(caught));
    } finally {
      setMoving(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border-strong p-6 text-center text-muted-foreground">
        Tu lista está vacía. Pegá un enlace de Mercado Libre para sumar el primer producto.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <EditorItemCard
              listId={listId}
              item={item}
              index={index}
              total={items.length}
              onMove={move}
              moving={moving}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
