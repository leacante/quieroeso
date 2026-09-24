"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page periodically while a payment is being confirmed. */
export function AutoRefresh({
  intervalMs = 3_000,
  maxAttempts = 20,
}: {
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, maxAttempts]);
  return null;
}
