"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatLondon } from "@/lib/format";
import type { LocationKind } from "@/lib/types";
import type { WizardType } from "../types";

export const TYPE_LABEL: Record<WizardType, string> = {
  assessment: "Assessment Lesson",
  one_to_one: "1-to-1 lesson",
  group: "Group session",
  sunday_bundle: "Sunday bundle",
  block: "Group block",
};

/** Only locations a parent can be offered; "online" is only ever shown when enabled. */
export const LOCATION_LABEL: Partial<Record<LocationKind, string>> = {
  tutor_place: "At the tutor's place",
  home_visit: "Home visit",
  online: "Online",
};

export const PRODUCT_LABEL = { saturday: "Saturday group", sunday_bundle: "Sunday bundle" } as const;

/** "Monday 2 November 2026, 17:00" in London time. */
export function londonWhen(iso: string | Date): string {
  return formatLondon(new Date(iso), "EEEE d MMMM yyyy, HH:mm");
}

export function londonDay(iso: string | Date): string {
  return formatLondon(new Date(iso), "EEEE d MMMM yyyy");
}

export function londonTime(iso: string | Date): string {
  return formatLondon(new Date(iso), "HH:mm");
}

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
}: {
  title: ReactNode;
  detail?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Accessible name when the visible title alone is ambiguous. */
  label?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-card border-2 border-sky-200 bg-white px-5 py-4 text-left",
          "transition-[border-color,background-color] duration-150 ease-out hover:border-navy-900 hover:bg-sky-50",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-sky-200 disabled:hover:bg-white",
        )}
      >
        <span className="font-display text-body font-medium">{title}</span>
        {detail ? <span className="text-small text-navy-600">{detail}</span> : null}
      </button>
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
