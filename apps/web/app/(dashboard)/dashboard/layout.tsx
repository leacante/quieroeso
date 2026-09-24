import { Logo } from "@quieroeso/ui";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-foreground bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard/lists" className="rounded-lg" aria-label="QuieroEso, mis listas">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <span
              className="hidden text-sm text-muted-foreground sm:inline"
              data-testid="current-user"
            >
              {user.name}
            </span>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2">
          <DashboardNav />
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
