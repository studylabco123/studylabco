/* eslint-disable @next/next/no-img-element -- SVG logo: next/image adds nothing for a static vector. */
import { cn } from "@/lib/cn";

export const LOGO_ALT = "Study Lab Co Tutoring logo";

export type LogoProps = {
  /** `full` is the complete roundel; `mark` drops the lettering for small sizes (under ~56px). */
  variant?: "full" | "mark";
  /** Rendered width and height in CSS pixels. */
  size?: number;
  /** Pass "" when the logo sits next to text that already names the business. */
  alt?: string;
  className?: string;
  priority?: boolean;
};

export function Logo({ variant = "full", size = 64, alt = LOGO_ALT, className, priority = false }: LogoProps) {
  return (
    <img
      src={variant === "full" ? "/logo.svg" : "/logo-mark.svg"}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
