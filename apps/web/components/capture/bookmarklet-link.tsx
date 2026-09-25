"use client";

import { cn } from "@quieroeso/ui";
import { BookmarkPlus } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { bookmarkletHref } from "./bookmarklet";

/**
 * Draggable "Guardar en QuieroEso" bookmark. React refuses `javascript:` hrefs in JSX,
 * so the address is set on the DOM node after mount; clicking it here does nothing.
 */
export function BookmarkletLink({ className }: { className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);

  function preventRun(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
  }

  return (
    <a
      ref={ref}
      onClick={preventRun}
      draggable
      className={cn(
        "inline-flex min-h-11 w-fit cursor-grab items-center gap-2 rounded-xl border-2 border-dashed border-foreground px-3 text-sm font-bold active:cursor-grabbing",
        className,
      )}
    >
      <BookmarkPlus className="size-4" aria-hidden="true" />
      Guardar en QuieroEso
    </a>
  );
}

/** How to install and use the bookmarklet. */
export function BookmarkletHelp() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        Algunas publicaciones de Mercado Libre no se pueden leer desde un enlace. Para esas, usá
        este botón desde tu computadora:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Arrastrá el botón a tu barra de favoritos (se hace una sola vez).</li>
        <li>Abrí el producto en Mercado Libre y tocá «Guardar en QuieroEso» en tus favoritos.</li>
        <li>Revisá nombre, foto y precio, elegí la lista y guardalo.</li>
      </ol>
      <BookmarkletLink />
    </div>
  );
}
