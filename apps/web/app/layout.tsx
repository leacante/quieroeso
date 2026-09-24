import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: siteUrl(),
    title: {
      default: "QuieroEso — Armá tu lista de deseos y compartila",
      template: "%s · QuieroEso",
    },
    description:
      "Creá listas de regalos con productos de Mercado Libre, compartilas por WhatsApp y recibí aportes directo en tu cuenta de Mercado Pago.",
    applicationName: "QuieroEso",
    openGraph: { siteName: "QuieroEso", locale: "es_AR", type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff1f2" },
    { media: "(prefers-color-scheme: dark)", color: "#160b0e" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
