import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "sky" | "success" | "warning" | "danger" | "neutral" | "onNavy";

const tones: Record<BadgeTone, string> = {
  sky: "bg-sky-100 text-navy-900 ring-1 ring-inset ring-sky-200",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  neutral: "bg-white text-navy-900 ring-1 ring-inset ring-navy-400",
  onNavy: "bg-white/10 text-white ring-1 ring-inset ring-white/35",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; icon?: ReactNode };

/** Small status or trust label. Always carries words; colour is never the only signal. */
export function Badge({ tone = "sky", icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-fine font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

/** Tick used on the trust badges. */
export function TickIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} fill="none">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
