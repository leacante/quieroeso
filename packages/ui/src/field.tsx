import { clsx } from "clsx";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const control =
  "block w-full rounded-xl border-2 border-border-strong bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground transition-colors duration-200 focus:border-foreground focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-destructive disabled:opacity-60";

type FieldShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
};

/** Label, control, hint and inline error wired together with aria-describedby. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold text-foreground">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type CommonFieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
};

export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  className,
  ...props
}: CommonFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      <input
        id={id}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  optional,
  className,
  ...props
}: CommonFieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      <textarea
        id={id}
        className={clsx(control, "min-h-24 resize-y")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
  ...props
}: CommonFieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      <select
        id={id}
        className={clsx(control, "min-h-12 appearance-auto")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}
