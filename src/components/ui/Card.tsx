import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li";
  /** `white` (default) sits on any background; `sky` is a pale panel for white pages. */
  tone?: "white" | "sky";
  /** Adds the floating shadow, for cards that sit over busy backgrounds. */
  raised?: boolean;
};

export function Card({ as: Tag = "div", tone = "white", raised = false, className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card border p-6 sm:p-8",
        tone === "white" ? "border-sky-200 bg-white" : "border-transparent bg-sky-100",
        raised && "shadow-card",
        className,
      )}
      {...props}
    />
  );
}
