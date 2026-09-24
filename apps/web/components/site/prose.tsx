import type { ReactNode } from "react";

/** Readable long-form layout for legal and informational pages (~70ch measure). */
export function Prose({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main id="contenido" className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: {updated}</p>
      <div className="mt-8 flex max-w-[70ch] flex-col gap-4 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </main>
  );
}
