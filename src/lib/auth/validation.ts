import { z } from "zod";

/** Removes all whitespace, so "07123 456 789" and "+44 7123 456789" validate. */
export function normalisePhone(raw: string): string {
  return raw.replace(/\s+/g, "");
}

export const UK_MOBILE = /^(\+44|0)7\d{9}$/;

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(true)])
  .optional()
  .transform((v) => v !== undefined);

export const signupSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  phone: z
    .string()
    .transform(normalisePhone)
    .pipe(z.string().regex(UK_MOBILE, "Enter a UK mobile number, like 07123 456789")),
  password: z.string().min(10, "Use at least 10 characters"),
  age_guardian: checkbox.refine((v) => v, "Please confirm you are 18 or over and the parent or legal guardian"),
  terms: checkbox.refine((v) => v, "Please agree to the Terms and Refund Policy to continue"),
  marketing: checkbox,
});

export type SignupInput = z.infer<typeof signupSchema>;

const DEFAULT_NEXT = "/account";

/** Only same-site relative paths; anything else falls back to /account. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return DEFAULT_NEXT;
  if (/[\\\u0000-\u001f]/.test(next)) return DEFAULT_NEXT;
  return next;
}

/** The `next` path when one was given and is safe; null when absent or unsafe. */
export function explicitNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  return safeNextPath(next) === next ? next : null;
}

/** Where to send someone after logging in: their explicit `next`, else /admin for admins and /account for everyone else. */
export function loginDestination(next: string | null | undefined, role: string | null | undefined): string {
  return explicitNextPath(next) ?? (role === "admin" ? "/admin" : DEFAULT_NEXT);
}
