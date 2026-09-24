import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t-2 border-foreground bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          QuieroEso no custodia dinero: los aportes se procesan en Mercado Pago y se acreditan en la
          cuenta de quien armó la lista.
        </p>
        <nav aria-label="Legal" className="flex shrink-0 gap-4">
          <Link
            href="/terms"
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            Términos
          </Link>
          <Link
            href="/privacy"
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            Privacidad
          </Link>
        </nav>
      </div>
    </footer>
  );
}
