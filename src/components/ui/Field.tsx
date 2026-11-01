"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { InfoTip } from "./InfoTip";

type ShellProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** An "i" button beside the label with a short explanation; `label` names it ("More about …"). */
  info?: { label: string; text: ReactNode };
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
  info,
  ids,
  children,
}: ShellProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  const labelEl = (
    <label htmlFor={ids.controlId} className={cn("font-display text-small font-medium", info && "min-w-0 flex-1")}>
      {label}
    </label>
  );
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {info ? (
        <div className="flex flex-wrap items-center gap-x-1">
          {labelEl}
          <InfoTip label={info.label} text={info.text} />
        </div>
      ) : (
        labelEl
      )}
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
export function Field({ label, hint, error, className, id, info, ...props }: FieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} className={className} info={info} ids={ids}>
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

export function TextareaField({ label, hint, error, className, id, info, rows = 5, ...props }: TextareaFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} className={className} info={info} ids={ids}>
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

export function SelectField({ label, hint, error, className, id, info, children, ...props }: SelectFieldProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} className={className} info={info} ids={ids}>
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
