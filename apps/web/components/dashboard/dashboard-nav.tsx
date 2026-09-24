"use client";

import { cn } from "@quieroeso/ui";
import { HandCoins, ListChecks, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard/lists", label: "Mis listas", icon: ListChecks },
  { href: "/dashboard/contributions", label: "Aportes", icon: HandCoins },
  { href: "/dashboard/mercadopago", label: "Mercado Pago", icon: Wallet },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel" className="flex gap-1 overflow-x-auto">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors duration-200",
              active ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
