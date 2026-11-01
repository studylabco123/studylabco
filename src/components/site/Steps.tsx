import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Step = { title: string; body: ReactNode };

/**
 * A numbered sequence (the order matters: each step unlocks the next).
 * Stacks with a connecting rule on phones; runs across on wide screens.
 */
export function Steps({ steps, label, className }: { steps: Step[]; label: string; className?: string }) {
  return (
    <ol
      aria-label={label}
      className={cn(
        "grid gap-0 md:gap-6",
        steps.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3",
        className,
      )}
    >
      {steps.map((step, i) => (
        <li key={step.title} className="relative flex gap-4 pb-8 last:pb-0 md:flex-col md:gap-4 md:pb-0">
          {/* connector: down on phones, across on wide screens */}
          {i < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-12 bottom-0 left-[1.4375rem] border-l-2 border-dashed border-sky-500 md:top-[1.4375rem] md:right-[-1.5rem] md:bottom-auto md:left-14 md:border-t-2 md:border-l-0",
                steps.length === 4 && "md:max-lg:hidden",
              )}
            />
          ) : null}
          <span
            aria-hidden="true"
            className="relative flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-navy-900 bg-white font-display text-lead font-semibold tabular-nums"
          >
            {i + 1}
          </span>
          <div className="flex flex-col gap-1.5 pt-2 md:pt-0">
            <h3 className="text-h3">
              <span className="sr-only">Step {i + 1}: </span>
              {step.title}
            </h3>
            <div className="text-small text-navy-600 [&_strong]:font-semibold [&_strong]:text-navy-900">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
