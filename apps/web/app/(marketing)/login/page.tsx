import { Card } from "@quieroeso/ui";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { safeReturnPath } from "@/lib/navigation";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Ingresar",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(typeof next === "string" ? next : undefined);

  if (await getCurrentUser()) {
    redirect(returnTo as Route);
  }

  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12"
    >
      <Card className="p-6 sm:p-8">
        <h1 className="text-3xl font-bold">Entrá a QuieroEso</h1>
        <p className="mt-2 text-muted-foreground">
          Armá tus listas, compartilas y seguí los aportes. Sólo necesitás tu cuenta de Google.
        </p>
        <div className="mt-6">
          <GoogleSignInButton callbackURL={returnTo} />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Al continuar aceptás los{" "}
          <Link
            href="/terms"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            términos
          </Link>{" "}
          y la{" "}
          <Link
            href="/privacy"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            política de privacidad
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
