import { clsx } from "clsx";

/** Provisional QuieroEso wordmark: a gift-tag mark plus the name. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-heading font-bold", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect
          x="3"
          y="9"
          width="26"
          height="20"
          rx="5"
          fill="var(--qe-primary)"
          stroke="var(--qe-foreground)"
          strokeWidth="2"
        />
        <rect x="14" y="9" width="4" height="20" fill="var(--qe-secondary)" />
        <path
          d="M16 9c-2.5-5-8-5-8-1.5C8 10 13 9.5 16 9Zm0 0c2.5-5 8-5 8-1.5C24 10 19 9.5 16 9Z"
          fill="var(--qe-accent)"
          stroke="var(--qe-foreground)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {withText ? <span className="text-xl tracking-tight">QuieroEso</span> : null}
    </span>
  );
}
