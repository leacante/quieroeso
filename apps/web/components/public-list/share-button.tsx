"use client";

import { Button } from "@quieroeso/ui";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";

/** Native share sheet on mobile; copies the link elsewhere. */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissed or unsupported: fall back to copying.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <Button
      variant="secondary"
      onClick={share}
      icon={
        copied ? (
          <Check className="size-5" aria-hidden="true" />
        ) : (
          <Share2 className="size-5" aria-hidden="true" />
        )
      }
    >
      <span aria-live="polite">{copied ? "¡Enlace copiado!" : "Compartir lista"}</span>
    </Button>
  );
}
