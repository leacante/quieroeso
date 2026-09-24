"use client";

import { Button } from "@quieroeso/ui";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={signOut}
      loading={pending}
      icon={<LogOut className="size-4" aria-hidden="true" />}
    >
      Salir
    </Button>
  );
}
