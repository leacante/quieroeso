import { buttonClassName } from "@quieroeso/ui";
import Link from "next/link";
import { PublicShell } from "@/components/site/public-shell";

export default function NotFound() {
  return (
    <PublicShell>
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
      >
        <p className="font-heading text-6xl font-bold text-primary">404</p>
        <h1 className="text-3xl font-bold">No encontramos esta página</h1>
        <p className="text-muted-foreground">
          Puede que el enlace esté mal escrito, que la lista ya no sea pública o que se haya
          generado un enlace nuevo.
        </p>
        <Link href="/" className={buttonClassName()}>
          Ir al inicio
        </Link>
      </main>
    </PublicShell>
  );
}
