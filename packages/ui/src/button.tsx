import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "accent";
export type ButtonSize = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out select-none disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-block border-2 border-foreground hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
  accent:
    "bg-accent text-on-accent shadow-block border-2 border-foreground hover:brightness-95 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
  secondary:
    "bg-card text-foreground border-2 border-foreground hover:bg-muted active:translate-y-px",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  destructive:
    "bg-card text-destructive border-2 border-destructive hover:bg-destructive hover:text-on-destructive",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-11 px-5 text-base",
  lg: "min-h-13 px-6 text-lg",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return clsx(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and announces the busy state. */
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant,
  size,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("size-5 animate-spin motion-reduce:animate-none", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
