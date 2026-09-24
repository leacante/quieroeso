import { Logo, buttonClassName } from "@quieroeso/ui";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b-2 border-foreground bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="rounded-lg" aria-label="QuieroEso, inicio">
          <Logo />
        </Link>
        <nav aria-label="Principal">
          <Link href="/dashboard" className={buttonClassName({ variant: "primary", size: "sm" })}>
            Mis listas
          </Link>
        </nav>
      </div>
    </header>
  );
}
