import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "md" | "lg";

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize; className?: string };

const base =
  "inline-flex items-center justify-center gap-2 rounded-full text-center font-display font-medium select-none " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out " +
  "motion-safe:active:scale-[0.97] motion-safe:active:duration-100 " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-800",
  secondary: "border-2 border-navy-900 bg-white text-navy-900 hover:bg-sky-100 active:bg-sky-200",
  quiet: "text-navy-900 underline-offset-4 hover:bg-sky-100 active:bg-sky-200",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-small whitespace-nowrap",
  lg: "min-h-13 px-6 py-2 text-body sm:px-7 sm:text-lead",
};

export function buttonClasses({ variant = "primary", size = "md", className }: StyleProps = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps;

/** A link styled as a button, for navigation actions such as "Book Assessment". */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
