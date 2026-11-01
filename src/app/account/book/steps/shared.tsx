"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { InfoTip } from "@/components/ui/InfoTip";
import { cn } from "@/lib/cn";

export { LOCATION_LABEL, londonDay, londonTime, londonWhen, TYPE_LABEL } from "./labels";

/** Step heading that takes focus when the step appears, so screen readers follow along. */
export function StepHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1} className="text-h2 outline-none">
      {children}
    </h2>
  );
}

/** A large, full-width choice button with a title and optional detail line. */
export function Choice({
  title,
  detail,
  onSelect,
  disabled,
  label,
  info,
  data,
}: {
  title: ReactNode;
  detail?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Accessible name when the visible title alone is ambiguous. */
  label?: string;
  /** An "i" button beside the choice (outside it, so the choice's own name is unchanged). */
  info?: { label: string; text: ReactNode };
  /** data-* attributes for the button (tests find choices by them). */
  data?: Record<`data-${string}`, string>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-label={label}
        {...data}
        className={cn(
          "group flex min-h-14 w-full min-w-0 flex-1 items-center gap-4 rounded-card border-2 border-sky-200 bg-white px-5 py-4 text-left",
          "transition-[border-color,background-color,transform] duration-150 ease-out hover:border-navy-900 hover:bg-sky-50",
          "motion-safe:active:scale-[0.99] motion-safe:active:duration-100",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-sky-200 disabled:hover:bg-white",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="font-display text-body font-medium">{title}</span>
          {detail ? <span className="text-small text-navy-600 tabular-nums">{detail}</span> : null}
        </span>
        {/* A chevron says "this moves you on", so the cards don't read as static information. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-5 shrink-0 text-navy-600 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-disabled:hidden"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 5l5 5-5 5" />
        </svg>
      </button>
      {info ? <InfoTip label={info.label} text={info.text} /> : null}
    </li>
  );
}

export function ChoiceList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {children}
    </ul>
  );
}
