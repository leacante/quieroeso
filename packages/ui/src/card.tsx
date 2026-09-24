import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border-2 border-foreground bg-card text-card-foreground shadow-block",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "accent" | "primary";
}) {
  const tones = {
    neutral: "bg-muted text-foreground border-border-strong",
    success: "bg-success-soft text-success border-success",
    warning: "bg-warning-soft text-warning-foreground border-warning-foreground",
    accent: "bg-accent-soft text-foreground border-accent",
    primary: "bg-primary text-on-primary border-primary",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  tone = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "info" | "error" | "success" | "warning" }) {
  const tones = {
    info: "bg-card border-border-strong",
    error: "bg-card border-destructive text-foreground",
    success: "bg-success-soft border-success",
    warning: "bg-warning-soft border-warning-foreground",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx("rounded-xl border-2 px-4 py-3 text-sm", tones[tone], className)}
      {...props}
    />
  );
}
