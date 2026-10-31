"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ShellProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

export const controlClasses =
  "block w-full rounded-field border-2 border-navy-400 bg-white px-3.5 py-2.5 text-body text-navy-900 " +
  "placeholder:text-navy-600 transition-[border-color] duration-150 ease-out hover:border-navy-600 " +
  "focus-visible:border-navy-900 aria-invalid:border-danger-700 disabled:bg-sky-50 disabled:opacity-70";

function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const auto = useId();
  const controlId = id ?? auto;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return { controlId, hintId, errorId, describedBy };
}

function Shell({
  label,
  hint,
  error,
  className,
  ids,
  children,
}: ShellProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={ids.controlId} className="font-display text-small font-medium">
        {label}
      </label>
      {hint ? (
        <p id={ids.hintId} className="text-fine text-navy-600">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={ids.errorId} className="flex items-start gap-1.5 text-small font-semibold text-danger-700">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0" fill="currentColor">
            <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-.9 4.5h1.8v5.2H9.1V6Zm.9 8.6a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
          </svg>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export type FieldProps = ShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

/** Labelled text input with optional hint and error message. */
export function Field({ label, hint, error, className, id, ...props }: FieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} className={className} ids={ids}>
      <input
        id={ids.controlId}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        className={controlClasses}
        {...props}
      />
    </Shell>
  );
}

export type TextareaFieldProps = ShellProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function TextareaField({ label, hint, error, className, id, rows = 5, ...props }: TextareaFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} className={className} ids={ids}>
      <textarea
        id={ids.controlId}
        rows={rows}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        className={controlClasses}
        {...props}
      />
    </Shell>
  );
}

export type SelectFieldProps = ShellProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">;

export function SelectField({ label, hint, error, className, id, children, ...props }: SelectFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} className={className} ids={ids}>
      <select
        id={ids.controlId}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(controlClasses, "min-h-12")}
        {...props}
      >
        {children}
      </select>
    </Shell>
  );
}
