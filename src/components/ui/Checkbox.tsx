"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  className?: string;
};

/**
 * Labelled checkbox. Consent checkboxes must start unticked: do not pass
 * `defaultChecked` for them.
 */
export function Checkbox({ label, description, error, className, id, ...props }: CheckboxProps) {
  const auto = useId();
  const controlId = id ?? auto;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-start gap-3">
        <input
          id={controlId}
          type="checkbox"
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-6 shrink-0 cursor-pointer rounded-sm accent-navy-900"
          {...props}
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={controlId} className="cursor-pointer text-body">
            {label}
          </label>
          {description ? (
            <p id={descriptionId} className="text-small text-navy-600">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} className="pl-9 text-small font-semibold text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
